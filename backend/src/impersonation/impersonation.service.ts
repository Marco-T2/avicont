import { Inject, Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { SystemRole } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';
import {
  IMPERSONATION_REPOSITORY_PORT,
  ImpersonationRepositoryPort,
  LogActionData,
} from './ports/impersonation.repository.port';
import { StartImpersonationDto } from './dto/start-impersonation.dto';
import {
  ImpersonationActivaExistenteError,
  NoAutorizadoACerrarSesionError,
  SelfImpersonationError,
  SesionImpersonationNoEncontradaError,
  SoloOwnerPuedeImpersonarError,
  TargetConCuentaDesactivadaError,
  TargetEsOwnerError,
  TargetMembershipDesactivadaError,
  TargetNoMiembroError,
} from './domain/impersonation-errors';
import { ImpersonationJwtClaims } from './domain/impersonation-jwt-claims';
import { ImpersonationReason } from './domain/impersonation-reason';
import { ImpersonationWindow } from './domain/impersonation-window';

@Injectable()
export class ImpersonationService {
  private readonly logger = new Logger(ImpersonationService.name);
  private readonly window = ImpersonationWindow.default();

  constructor(
    @Inject(IMPERSONATION_REPOSITORY_PORT)
    private readonly repo: ImpersonationRepositoryPort,
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async start(
    adminUserId: string,
    organizationId: string,
    dto: StartImpersonationDto,
  ): Promise<{ impersonationToken: string; expiresAt: Date; impersonationId: string }> {
    const reason = ImpersonationReason.of(dto.reason);

    const adminMembership = await this.prisma.membership.findUnique({
      where: { organizationId_userId: { organizationId, userId: adminUserId } },
    });
    if (!adminMembership || adminMembership.systemRole !== SystemRole.OWNER) {
      throw new SoloOwnerPuedeImpersonarError(adminUserId, organizationId);
    }

    const active = await this.repo.findActiveByAdmin(adminUserId);
    if (active) {
      throw new ImpersonationActivaExistenteError(adminUserId);
    }

    if (dto.targetUserId === adminUserId) {
      throw new SelfImpersonationError(adminUserId);
    }
    const targetMembership = await this.prisma.membership.findUnique({
      where: { organizationId_userId: { organizationId, userId: dto.targetUserId } },
      include: {
        user: { select: { id: true, email: true, isActive: true } },
        customRole: { select: { slug: true } },
      },
    });
    if (!targetMembership) {
      throw new TargetNoMiembroError(dto.targetUserId, organizationId);
    }
    if (targetMembership.deactivatedAt) {
      throw new TargetMembershipDesactivadaError(dto.targetUserId, organizationId);
    }
    if (!targetMembership.user.isActive) {
      throw new TargetConCuentaDesactivadaError(dto.targetUserId);
    }
    if (targetMembership.systemRole === SystemRole.OWNER) {
      throw new TargetEsOwnerError(dto.targetUserId);
    }

    const log = await this.repo.createLog({
      adminUserId,
      targetUserId: dto.targetUserId,
      organizationId,
      reason: reason.toString(),
    });

    const roles = targetMembership.systemRole
      ? [targetMembership.systemRole]
      : targetMembership.customRole
        ? [targetMembership.customRole.slug]
        : [];

    const claims = ImpersonationJwtClaims.forImpersonation({
      targetUserId: dto.targetUserId,
      targetEmail: targetMembership.user.email,
      activeTenantId: organizationId,
      roles,
      adminUserId,
      impersonationId: log.id,
    });

    const now = new Date();
    const expiresAt = this.window.expiresAt(now);
    const impersonationToken = this.jwt.sign(claims.toPayload(), {
      expiresIn: this.window.toExpiresIn(),
    });

    this.logger.log(
      `Impersonation started: admin=${adminUserId} target=${dto.targetUserId} log=${log.id}`,
    );

    return { impersonationToken, expiresAt, impersonationId: log.id };
  }

  async end(impersonationId: string, callerUserId: string): Promise<void> {
    const log = await this.repo.findActiveById(impersonationId);
    if (!log) {
      throw new SesionImpersonationNoEncontradaError(impersonationId);
    }
    if (log.adminUserId !== callerUserId && log.targetUserId !== callerUserId) {
      throw new NoAutorizadoACerrarSesionError(impersonationId, callerUserId);
    }
    await this.repo.endLog(impersonationId);
    this.logger.log(`Impersonation ended: log=${impersonationId} by=${callerUserId}`);
  }

  async logAction(data: LogActionData): Promise<void> {
    try {
      await this.repo.logAction(data);
    } catch (err) {
      this.logger.warn(`Failed to log impersonation action: ${(err as Error).message}`);
    }
  }
}
