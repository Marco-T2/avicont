import { Inject, Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { SystemRole } from '@prisma/client';

import { CLOCK_PORT, ClockPort } from '@/common/clock/clock.port';
import {
  MEMBERSHIPS_READER_PORT,
  MembershipsReaderPort,
} from '@/memberships/ports/memberships-reader.port';
import { PLATFORM_AUDIT_PORT, PlatformAuditPort } from '@/platform/ports/platform-audit.port';

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
    @Inject(MEMBERSHIPS_READER_PORT)
    private readonly memberships: MembershipsReaderPort,
    private readonly jwt: JwtService,
    @Inject(CLOCK_PORT) private readonly clock: ClockPort,
    @Inject(PLATFORM_AUDIT_PORT) private readonly platformAudit: PlatformAuditPort,
  ) {}

  async start(
    adminUserId: string,
    organizationId: string,
    dto: StartImpersonationDto,
    callerEsSuperAdmin = false,
  ): Promise<{ impersonationToken: string; expiresAt: Date; impersonationId: string }> {
    const reason = ImpersonationReason.of(dto.reason);

    const adminMembership = await this.memberships.findForImpersonation(
      adminUserId,
      organizationId,
    );
    // docs/disenos/super-admin-plataforma.md §4.3: un super-admin puede impersonar
    // en cualquier org sin ser miembro. Un no-super-admin sigue necesitando ser OWNER.
    if (
      !callerEsSuperAdmin &&
      (!adminMembership || adminMembership.systemRole !== SystemRole.OWNER)
    ) {
      throw new SoloOwnerPuedeImpersonarError(adminUserId, organizationId);
    }

    const active = await this.repo.findActiveByAdmin(adminUserId);
    if (active) {
      throw new ImpersonationActivaExistenteError(adminUserId);
    }

    if (dto.targetUserId === adminUserId) {
      throw new SelfImpersonationError(adminUserId);
    }
    const targetMembership = await this.memberships.findForImpersonation(
      dto.targetUserId,
      organizationId,
    );
    if (!targetMembership) {
      throw new TargetNoMiembroError(dto.targetUserId, organizationId);
    }
    if (targetMembership.deactivatedAt) {
      throw new TargetMembershipDesactivadaError(dto.targetUserId, organizationId);
    }
    if (!targetMembership.userIsActive) {
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
      : targetMembership.customRoleSlug
        ? [targetMembership.customRoleSlug]
        : [];

    const claims = ImpersonationJwtClaims.forImpersonation({
      targetUserId: dto.targetUserId,
      targetEmail: targetMembership.userEmail,
      activeTenantId: organizationId,
      roles,
      adminUserId,
      impersonationId: log.id,
    });

    const now = this.clock.now();
    const expiresAt = this.window.expiresAt(now);
    const impersonationToken = this.jwt.sign(claims.toPayload(), {
      expiresIn: this.window.toExpiresIn(),
    });

    this.logger.log(
      `Impersonation started: admin=${adminUserId} target=${dto.targetUserId} log=${log.id}`,
    );

    // REQ-SA-17: auditoría cross-tenant en platform_audit cuando el caller es super-admin.
    // El ImpersonationLog existente se crea siempre (línea anterior); esta fila adicional
    // es para el trail de auditoría de plataforma (docs/disenos/super-admin-plataforma.md §6).
    // Es best-effort: si falla, no interrumpe la respuesta principal.
    if (callerEsSuperAdmin) {
      this.platformAudit
        .record({
          actorUserId: adminUserId,
          action: 'platform.impersonation.start',
          targetOrganizationId: organizationId,
          payload: { targetUserId: dto.targetUserId, impersonationId: log.id },
          createdAt: now,
        })
        .catch((err: Error) =>
          this.logger.warn(`Failed to write platform_audit for impersonation: ${err.message}`),
        );
    }

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
