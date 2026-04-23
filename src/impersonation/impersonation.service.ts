import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { SystemRole } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';
import {
  IMPERSONATION_REPOSITORY_PORT,
  ImpersonationRepositoryPort,
  LogActionData,
} from './ports/impersonation.repository.port';
import { StartImpersonationDto } from './dto/start-impersonation.dto';

const IMPERSONATION_TTL_MIN = 30;

// Payload del access token DURANTE una sesión de impersonation.
// Es distinto del JwtPayload normal porque expone impersonatedBy + impersonationId.
// Definido acá para evitar dependencia circular con AuthService.
export interface ImpersonationJwtPayload {
  sub: string; // targetUserId
  email: string;
  activeTenantId: string;
  roles: string[]; // del target
  impersonatedBy: string; // adminUserId real
  impersonationId: string;
}

@Injectable()
export class ImpersonationService {
  private readonly logger = new Logger(ImpersonationService.name);

  constructor(
    @Inject(IMPERSONATION_REPOSITORY_PORT)
    private readonly repo: ImpersonationRepositoryPort,
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  // ---- Iniciar impersonation ----
  async start(
    adminUserId: string,
    organizationId: string,
    dto: StartImpersonationDto,
  ): Promise<{ impersonationToken: string; expiresAt: Date; impersonationId: string }> {
    // 1. Admin debe ser OWNER del tenant.
    const adminMembership = await this.prisma.membership.findUnique({
      where: { organizationId_userId: { organizationId, userId: adminUserId } },
    });
    if (!adminMembership || adminMembership.systemRole !== SystemRole.OWNER) {
      throw new ForbiddenException('Solo OWNER puede impersonar usuarios de la organización');
    }

    // 2. No iniciar dos sesiones de impersonation en simultáneo.
    const active = await this.repo.findActiveByAdmin(adminUserId);
    if (active) {
      throw new ConflictException(
        'Ya tenés una sesión de impersonation activa; cerrala antes de iniciar otra',
      );
    }

    // 3. Target debe ser miembro activo del mismo tenant y NO ser otro OWNER.
    if (dto.targetUserId === adminUserId) {
      throw new BadRequestException('No se puede impersonar a uno mismo');
    }
    const targetMembership = await this.prisma.membership.findUnique({
      where: { organizationId_userId: { organizationId, userId: dto.targetUserId } },
      include: {
        user: { select: { id: true, email: true, isActive: true } },
        customRole: { select: { slug: true } },
      },
    });
    if (!targetMembership) {
      throw new NotFoundException('Target no es miembro de la organización');
    }
    if (targetMembership.deactivatedAt) {
      throw new BadRequestException('Target está desactivado');
    }
    if (!targetMembership.user.isActive) {
      throw new BadRequestException('Target tiene cuenta desactivada');
    }
    if (targetMembership.systemRole === SystemRole.OWNER) {
      throw new ForbiddenException('No se puede impersonar a otro OWNER');
    }

    // 4. Crear log y emitir token.
    const log = await this.repo.createLog({
      adminUserId,
      targetUserId: dto.targetUserId,
      organizationId,
      reason: dto.reason,
    });

    const roles = targetMembership.systemRole
      ? [targetMembership.systemRole]
      : targetMembership.customRole
        ? [targetMembership.customRole.slug]
        : [];

    const payload: ImpersonationJwtPayload = {
      sub: dto.targetUserId,
      email: targetMembership.user.email,
      activeTenantId: organizationId,
      roles,
      impersonatedBy: adminUserId,
      impersonationId: log.id,
    };

    const expiresAt = new Date(Date.now() + IMPERSONATION_TTL_MIN * 60 * 1000);
    const impersonationToken = this.jwt.sign(payload, {
      expiresIn: `${IMPERSONATION_TTL_MIN}m`,
    });

    this.logger.log(
      `Impersonation started: admin=${adminUserId} target=${dto.targetUserId} log=${log.id}`,
    );

    return { impersonationToken, expiresAt, impersonationId: log.id };
  }

  // ---- Cerrar impersonation ----
  async end(impersonationId: string, callerUserId: string): Promise<void> {
    const log = await this.repo.findActiveById(impersonationId);
    if (!log) {
      throw new NotFoundException('Sesión de impersonation no encontrada o ya cerrada');
    }
    // Solo el admin que la inició (o el target, si quiere "salirse") puede cerrar.
    if (log.adminUserId !== callerUserId && log.targetUserId !== callerUserId) {
      throw new UnauthorizedException('No autorizado a cerrar esta sesión');
    }
    await this.repo.endLog(impersonationId);
    this.logger.log(`Impersonation ended: log=${impersonationId} by=${callerUserId}`);
  }

  // ---- Registrar acción durante impersonation (llamado desde interceptor) ----
  async logAction(data: LogActionData): Promise<void> {
    try {
      await this.repo.logAction(data);
    } catch (err) {
      // No interrumpir el request si falla el audit; queda en logs para detección.
      this.logger.warn(`Failed to log impersonation action: ${(err as Error).message}`);
    }
  }
}
