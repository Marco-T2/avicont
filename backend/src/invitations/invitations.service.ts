import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  GoneException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Invitation, InvitationStatus, SystemRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';

import { PrismaService } from '@/common/prisma.service';
import {
  CUSTOM_ROLES_READER_PORT,
  CustomRolesReaderPort,
} from '@/custom-roles/ports/custom-roles-reader.port';
import {
  INVITATION_EMAILS_PORT,
  InvitationEmailsPort,
} from '@/notifications/ports/invitation-emails.port';
import {
  PERMISSIONS_CACHE_INVALIDATION_PORT,
  PermissionsCacheInvalidationPort,
} from '@/rbac/ports/permissions-cache-invalidation.port';

import { CreateInvitationDto } from './dto/create-invitation.dto';
import {
  INVITATION_REPOSITORY_PORT,
  InvitationRepositoryPort,
} from './ports/invitation.repository.port';

const TOKEN_BYTES = 32;
const DEFAULT_EXPIRY_DAYS = 7;

@Injectable()
export class InvitationsService {
  private readonly logger = new Logger(InvitationsService.name);

  constructor(
    @Inject(INVITATION_REPOSITORY_PORT)
    private readonly repo: InvitationRepositoryPort,
    private readonly prisma: PrismaService,
    @Inject(INVITATION_EMAILS_PORT)
    private readonly invitationEmails: InvitationEmailsPort,
    @Inject(PERMISSIONS_CACHE_INVALIDATION_PORT)
    private readonly rbac: PermissionsCacheInvalidationPort,
    @Inject(CUSTOM_ROLES_READER_PORT)
    private readonly customRoles: CustomRolesReaderPort,
    private readonly config: ConfigService,
  ) {}

  // ----- Crear invitación (admin) -----
  async create(
    organizationId: string,
    inviterId: string,
    dto: CreateInvitationDto,
  ): Promise<{ invitation: Invitation; token: string }> {
    this.assertExactlyOneRoleAssignment(dto.systemRole, dto.customRoleId);

    const email = dto.email.toLowerCase().trim();

    // Si el rol es customRoleId, validar que pertenezca a la org.
    // El reader port retorna false tanto si el ID no existe como si
    // pertenece a otro tenant (no se distinguen los casos, para no
    // filtrar IDs cross-tenant).
    if (dto.customRoleId) {
      const ok = await this.customRoles.belongsToTenant(
        dto.customRoleId,
        organizationId,
      );
      if (!ok) {
        throw new BadRequestException(
          'customRoleId inválido para esta organización',
        );
      }
    }

    // Si ya es miembro activo, rechazar.
    const existingUser = await this.prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      const existingMembership = await this.prisma.membership.findUnique({
        where: {
          organizationId_userId: { organizationId, userId: existingUser.id },
        },
      });
      if (existingMembership && !existingMembership.deactivatedAt) {
        throw new ConflictException('El usuario ya es miembro de la organización');
      }
    }

    // Si hay invitación PENDING vigente, rechazar (revocar primero o usar la activa).
    const pending = await this.repo.findActivePendingForEmail(organizationId, email);
    if (pending) {
      throw new ConflictException('Ya existe una invitación pendiente para este email');
    }

    // Inviter, organization para el email.
    const inviter = await this.prisma.user.findUnique({
      where: { id: inviterId },
      select: { displayName: true, email: true },
    });
    const organization = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { name: true },
    });
    if (!inviter || !organization) {
      throw new NotFoundException('Inviter u organización no encontrados');
    }

    const token = crypto.randomBytes(TOKEN_BYTES).toString('hex');
    const tokenHash = this.hashToken(token);
    const expiresAt = new Date(
      Date.now() + (dto.expiresInDays ?? DEFAULT_EXPIRY_DAYS) * 24 * 60 * 60 * 1000,
    );

    const invitation = await this.repo.create({
      organizationId,
      email,
      invitedById: inviterId,
      systemRole: dto.systemRole ?? null,
      customRoleId: dto.customRoleId ?? null,
      tokenHash,
      expiresAt,
    });

    // Enviar email vía adapter (console en dev, Resend/SMTP en prod).
    const baseUrl = this.config.get<string>('APP_BASE_URL', 'http://localhost:3000');
    const inviteUrl = `${baseUrl}/invitations/accept?token=${token}`;
    try {
      await this.invitationEmails.sendInviteEmail(email, {
        inviterName: inviter.displayName ?? inviter.email,
        tenantName: organization.name,
        inviteUrl,
      });
    } catch (e) {
      // No revertir la invitación si el email falla; queda en BD para reenvío manual.
      this.logger.warn(`sendInviteEmail failed for ${email}: ${(e as Error).message}`);
    }

    return { invitation, token };
  }

  // ----- Listar invitaciones de la org (admin) -----
  list(organizationId: string, status?: InvitationStatus): Promise<Invitation[]> {
    return this.repo.listByOrganization(organizationId, status);
  }

  // ----- Revocar invitación pendiente (admin) -----
  async revoke(organizationId: string, id: string): Promise<Invitation> {
    const inv = await this.repo.findById(id);
    if (!inv || inv.organizationId !== organizationId) {
      throw new NotFoundException('Invitación no encontrada');
    }
    if (inv.status !== 'PENDING') {
      throw new BadRequestException(`No se puede revocar una invitación en estado ${inv.status}`);
    }
    return this.repo.markRevoked(id);
  }

  // ----- Preview público con token (para frontend antes del accept) -----
  async previewByToken(token: string) {
    const inv = await this.lookupValidInvitation(token);
    return {
      organization: inv.organization,
      invitedBy: { displayName: inv.invitedBy.displayName, email: inv.invitedBy.email },
      email: inv.email,
      expiresAt: inv.expiresAt,
    };
  }

  // ----- Aceptar con user existente (auth requerido) -----
  async acceptWithExistingUser(token: string, currentUserId: string): Promise<Invitation> {
    const inv = await this.lookupValidInvitation(token);

    const currentUser = await this.prisma.user.findUnique({
      where: { id: currentUserId },
      select: { id: true, email: true },
    });
    if (!currentUser) {
      throw new UnauthorizedException('Usuario actual no encontrado');
    }
    if (currentUser.email.toLowerCase() !== inv.email.toLowerCase()) {
      throw new ForbiddenException(
        'Esta invitación está dirigida a otro email; iniciá sesión con la cuenta correcta',
      );
    }

    return this.applyInvitation(inv, currentUser.id);
  }

  // ----- Aceptar creando user nuevo (público, solo el token autoriza) -----
  async acceptAndRegister(
    token: string,
    password: string,
    displayName?: string,
  ): Promise<{ invitation: Invitation; userId: string }> {
    const inv = await this.lookupValidInvitation(token);

    // Si ya existe un user con ese email, no se puede usar accept-and-register:
    // debe iniciar sesión y usar /accept.
    const existing = await this.prisma.user.findUnique({ where: { email: inv.email } });
    if (existing) {
      throw new ConflictException(
        'Ya existe una cuenta con este email; iniciá sesión y aceptá la invitación desde tu cuenta',
      );
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const result = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: inv.email,
          hashedPassword,
          displayName: displayName ?? null,
          isEmailVerified: true, // demostró posesión del email vía token
          isActive: true,
        },
      });
      const updated = await this.applyInvitationTx(tx, inv, user.id);
      return { invitation: updated, userId: user.id };
    });

    // Cache: nuevo membership creado, no hay nada que invalidar (no había antes).
    return result;
  }

  // ============ helpers ============

  private async lookupValidInvitation(token: string) {
    const tokenHash = this.hashToken(token);
    const inv = await this.repo.findByTokenHash(tokenHash);
    if (!inv) throw new NotFoundException('Invitación no encontrada');
    if (inv.status === 'REVOKED') throw new GoneException('La invitación fue revocada');
    if (inv.status === 'ACCEPTED') throw new GoneException('La invitación ya fue aceptada');
    if (inv.status === 'EXPIRED' || inv.expiresAt < new Date()) {
      throw new GoneException('La invitación expiró');
    }
    return inv;
  }

  private async applyInvitation(
    inv: Awaited<ReturnType<InvitationRepositoryPort['findByTokenHash']>>,
    userId: string,
  ): Promise<Invitation> {
    if (!inv) throw new NotFoundException('Invitación no encontrada');
    return this.prisma.$transaction((tx) => this.applyInvitationTx(tx, inv, userId));
  }

  private async applyInvitationTx(
    tx: Parameters<Parameters<PrismaService['$transaction']>[0]>[0],
    inv: NonNullable<Awaited<ReturnType<InvitationRepositoryPort['findByTokenHash']>>>,
    userId: string,
  ): Promise<Invitation> {
    // Crear o reactivar membership
    const existing = await tx.membership.findUnique({
      where: { organizationId_userId: { organizationId: inv.organizationId, userId } },
    });

    if (existing) {
      if (!existing.deactivatedAt) {
        throw new ConflictException('Ya sos miembro de esta organización');
      }
      await tx.membership.update({
        where: { id: existing.id },
        data: {
          deactivatedAt: null,
          systemRole: inv.systemRole ?? null,
          customRoleId: inv.customRoleId ?? null,
        },
      });
    } else {
      await tx.membership.create({
        data: {
          organizationId: inv.organizationId,
          userId,
          systemRole: inv.systemRole ?? null,
          customRoleId: inv.customRoleId ?? null,
        },
      });
    }

    const updatedInvitation = await tx.invitation.update({
      where: { id: inv.id },
      data: {
        status: 'ACCEPTED',
        acceptedAt: new Date(),
        acceptedByUserId: userId,
      },
    });

    // Invalidación post-commit: el caller no puede usar await this.rbac.invalidate
    // dentro de la TX (rompe atomicidad), pero como la TX commitea antes de salir
    // del callback de $transaction, lo hacemos aquí dentro y aceptamos el caso
    // borde de "cache inválido entre commit y este await" como degradación menor.
    await this.rbac.invalidateUser(userId, inv.organizationId);

    return updatedInvitation;
  }

  private assertExactlyOneRoleAssignment(
    systemRole?: SystemRole | null,
    customRoleId?: string | null,
  ) {
    const hasSystem = systemRole !== undefined && systemRole !== null;
    const hasCustom = !!customRoleId;
    if (hasSystem === hasCustom) {
      throw new BadRequestException(
        'Debe especificarse exactamente uno de systemRole o customRoleId',
      );
    }
  }

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }
}
