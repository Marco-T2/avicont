import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { SystemRole } from '@prisma/client';

import { CLOCK_PORT } from '@/common/clock/clock.port';
import { FakeClockAdapter } from '@/common/clock/fake-clock.adapter';
import {
  MEMBERSHIPS_READER_PORT,
  type MembershipsReaderPort,
} from '@/memberships/ports/memberships-reader.port';
import { PLATFORM_AUDIT_PORT, type PlatformAuditPort } from '@/platform/ports/platform-audit.port';

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
  ImpersonationReasonInvalidaError,
} from './domain/impersonation-errors';
import { ImpersonationService } from './impersonation.service';
import {
  IMPERSONATION_REPOSITORY_PORT,
  type ImpersonationRepositoryPort,
} from './ports/impersonation.repository.port';

/**
 * Unit tests de ImpersonationService. Cubren el cableado entre el service
 * y los ports (repo + memberships reader) sin tocar Postgres. La
 * integración full-stack vive en `test/impersonation.e2e-spec.ts`.
 */
describe('ImpersonationService (unit)', () => {
  const TENANT = 'tenant-uuid';
  const ADMIN = 'admin-uuid';
  const TARGET = 'target-uuid';
  const LOG_ID = '123e4567-e89b-42d3-a456-426614174000';

  type RepoMock = jest.Mocked<ImpersonationRepositoryPort>;
  type MembershipsMock = jest.Mocked<MembershipsReaderPort>;
  type AuditMock = jest.Mocked<PlatformAuditPort>;

  let service: ImpersonationService;
  let repo: RepoMock;
  let memberships: MembershipsMock;
  let platformAudit: AuditMock;
  let jwt: { sign: jest.Mock };
  let clock: FakeClockAdapter;

  beforeEach(async () => {
    repo = {
      createLog: jest.fn().mockResolvedValue({ id: LOG_ID }),
      findActiveByAdmin: jest.fn().mockResolvedValue(null),
      findActiveById: jest.fn(),
      endLog: jest.fn(),
      logAction: jest.fn(),
    } as unknown as RepoMock;
    memberships = {
      findActivasByUserId: jest.fn(),
      findActivaByUserAndTenant: jest.fn(),
      findActivasConOrganizacionByUserId: jest.fn(),
      findForImpersonation: jest.fn(),
      findAllByTenant: jest.fn(),
    } as unknown as MembershipsMock;
    platformAudit = {
      record: jest.fn().mockResolvedValue(undefined),
    } as unknown as AuditMock;
    jwt = { sign: jest.fn().mockReturnValue('signed.jwt.token') };
    clock = new FakeClockAdapter();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ImpersonationService,
        { provide: IMPERSONATION_REPOSITORY_PORT, useValue: repo },
        { provide: MEMBERSHIPS_READER_PORT, useValue: memberships },
        { provide: PLATFORM_AUDIT_PORT, useValue: platformAudit },
        { provide: JwtService, useValue: jwt },
        { provide: CLOCK_PORT, useValue: clock },
      ],
    }).compile();

    service = module.get(ImpersonationService);
  });

  function adminOwner(overrides: Partial<Parameters<typeof mkMembership>[0]> = {}) {
    return mkMembership({
      systemRole: SystemRole.OWNER,
      userEmail: 'admin@imp.bo',
      ...overrides,
    });
  }

  function targetContador(overrides: Partial<Parameters<typeof mkMembership>[0]> = {}) {
    return mkMembership({
      systemRole: null,
      customRoleSlug: 'contador',
      userEmail: 'target@imp.bo',
      ...overrides,
    });
  }

  function mkMembership(over: {
    systemRole?: string | null;
    customRoleSlug?: string | null;
    deactivatedAt?: Date | null;
    userEmail?: string;
    userIsActive?: boolean;
  }) {
    return {
      systemRole: over.systemRole ?? null,
      customRoleSlug: over.customRoleSlug ?? null,
      deactivatedAt: over.deactivatedAt ?? null,
      userEmail: over.userEmail ?? 'u@imp.bo',
      userIsActive: over.userIsActive ?? true,
    };
  }

  const validDto = () => ({
    targetUserId: TARGET,
    reason: 'Soporte: usuario reporta no ver sus asientos',
  });

  describe('start', () => {
    it('emite token, arma payload con claims de impersonation y retorna expiresAt', async () => {
      memberships.findForImpersonation
        .mockResolvedValueOnce(adminOwner())
        .mockResolvedValueOnce(targetContador());

      const result = await service.start(ADMIN, TENANT, validDto());

      expect(result.impersonationToken).toBe('signed.jwt.token');
      expect(result.impersonationId).toBe(LOG_ID);
      expect(result.expiresAt).toBeInstanceOf(Date);
      expect(jwt.sign).toHaveBeenCalledWith(
        expect.objectContaining({
          sub: TARGET,
          email: 'target@imp.bo',
          activeTenantId: TENANT,
          roles: ['contador'],
          impersonatedBy: ADMIN,
          impersonationId: LOG_ID,
        }),
        { expiresIn: '30m' },
      );
      expect(repo.createLog).toHaveBeenCalledWith({
        adminUserId: ADMIN,
        targetUserId: TARGET,
        organizationId: TENANT,
        reason: 'Soporte: usuario reporta no ver sus asientos',
      });
    });

    it('prefiere systemRole sobre customRoleSlug al armar roles del target', async () => {
      memberships.findForImpersonation
        .mockResolvedValueOnce(adminOwner())
        .mockResolvedValueOnce(mkMembership({ systemRole: 'ADMIN', customRoleSlug: 'contador' }));

      await service.start(ADMIN, TENANT, validDto());

      expect(jwt.sign).toHaveBeenCalledWith(
        expect.objectContaining({ roles: ['ADMIN'] }),
        expect.anything(),
      );
    });

    it('roles queda vacío si target no tiene ni systemRole ni customRoleSlug', async () => {
      memberships.findForImpersonation
        .mockResolvedValueOnce(adminOwner())
        .mockResolvedValueOnce(mkMembership({ systemRole: null, customRoleSlug: null }));

      await service.start(ADMIN, TENANT, validDto());

      expect(jwt.sign).toHaveBeenCalledWith(
        expect.objectContaining({ roles: [] }),
        expect.anything(),
      );
    });

    it('rechaza si admin no es miembro', async () => {
      memberships.findForImpersonation.mockResolvedValueOnce(null);

      await expect(service.start(ADMIN, TENANT, validDto())).rejects.toThrow(
        SoloOwnerPuedeImpersonarError,
      );
      expect(repo.createLog).not.toHaveBeenCalled();
    });

    it('rechaza si admin no es OWNER (p. ej. tiene customRole)', async () => {
      memberships.findForImpersonation.mockResolvedValueOnce(
        mkMembership({ systemRole: null, customRoleSlug: 'contador' }),
      );

      await expect(service.start(ADMIN, TENANT, validDto())).rejects.toThrow(
        SoloOwnerPuedeImpersonarError,
      );
    });

    it('rechaza si admin ya tiene una sesión activa', async () => {
      memberships.findForImpersonation.mockResolvedValueOnce(adminOwner());
      repo.findActiveByAdmin.mockResolvedValueOnce({
        id: 'otro-log',
      } as unknown as Awaited<ReturnType<RepoMock['findActiveByAdmin']>>);

      await expect(service.start(ADMIN, TENANT, validDto())).rejects.toThrow(
        ImpersonationActivaExistenteError,
      );
      expect(repo.createLog).not.toHaveBeenCalled();
    });

    it('rechaza self-impersonation', async () => {
      memberships.findForImpersonation.mockResolvedValueOnce(adminOwner());

      await expect(
        service.start(ADMIN, TENANT, { ...validDto(), targetUserId: ADMIN }),
      ).rejects.toThrow(SelfImpersonationError);
    });

    it('rechaza si target no es miembro del tenant', async () => {
      memberships.findForImpersonation
        .mockResolvedValueOnce(adminOwner())
        .mockResolvedValueOnce(null);

      await expect(service.start(ADMIN, TENANT, validDto())).rejects.toThrow(TargetNoMiembroError);
    });

    it('rechaza si la membership del target está desactivada', async () => {
      memberships.findForImpersonation
        .mockResolvedValueOnce(adminOwner())
        .mockResolvedValueOnce(targetContador({ deactivatedAt: new Date('2026-01-15T00:00:00Z') }));

      await expect(service.start(ADMIN, TENANT, validDto())).rejects.toThrow(
        TargetMembershipDesactivadaError,
      );
    });

    it('rechaza si la cuenta del target está desactivada', async () => {
      memberships.findForImpersonation
        .mockResolvedValueOnce(adminOwner())
        .mockResolvedValueOnce(targetContador({ userIsActive: false }));

      await expect(service.start(ADMIN, TENANT, validDto())).rejects.toThrow(
        TargetConCuentaDesactivadaError,
      );
    });

    it('rechaza si el target también es OWNER', async () => {
      memberships.findForImpersonation
        .mockResolvedValueOnce(adminOwner())
        .mockResolvedValueOnce(
          mkMembership({ systemRole: SystemRole.OWNER, userEmail: 'otro-owner@imp.bo' }),
        );

      await expect(service.start(ADMIN, TENANT, validDto())).rejects.toThrow(TargetEsOwnerError);
    });

    it('rechaza reason inválida sin tocar ports', async () => {
      await expect(
        service.start(ADMIN, TENANT, { targetUserId: TARGET, reason: 'corta' }),
      ).rejects.toThrow(ImpersonationReasonInvalidaError);
      expect(memberships.findForImpersonation).not.toHaveBeenCalled();
    });

    // REQ-SA-17: rama aditiva callerEsSuperAdmin
    describe('REQ-SA-17: rama aditiva callerEsSuperAdmin', () => {
      it('[+] callerEsSuperAdmin = true sin adminMembership → no lanza SoloOwnerPuedeImpersonarError', async () => {
        // super-admin no tiene membership en el org destino
        memberships.findForImpersonation
          .mockResolvedValueOnce(null) // adminMembership = null
          .mockResolvedValueOnce(targetContador()); // targetMembership

        const result = await service.start(ADMIN, TENANT, validDto(), true);

        expect(result.impersonationToken).toBe('signed.jwt.token');
        expect(result.impersonationId).toBe(LOG_ID);
      });

      it('[+] callerEsSuperAdmin = true → llama a platformAudit.record con action platform.impersonation.start', async () => {
        memberships.findForImpersonation
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce(targetContador());

        await service.start(ADMIN, TENANT, validDto(), true);

        expect(platformAudit.record).toHaveBeenCalledWith(
          expect.objectContaining({
            actorUserId: ADMIN,
            action: 'platform.impersonation.start',
            targetOrganizationId: TENANT,
          }),
        );
      });

      it('[-] callerEsSuperAdmin = true pero target es OWNER → lanza TargetEsOwnerError', async () => {
        memberships.findForImpersonation
          .mockResolvedValueOnce(null) // super-admin sin membership
          .mockResolvedValueOnce(mkMembership({ systemRole: SystemRole.OWNER, userEmail: 'owner@imp.bo' }));

        await expect(service.start(ADMIN, TENANT, validDto(), true)).rejects.toThrow(
          TargetEsOwnerError,
        );
        expect(platformAudit.record).not.toHaveBeenCalled();
      });

      it('[-] callerEsSuperAdmin = false sin adminMembership → lanza SoloOwnerPuedeImpersonarError (regresión)', async () => {
        memberships.findForImpersonation.mockResolvedValueOnce(null);

        await expect(service.start(ADMIN, TENANT, validDto(), false)).rejects.toThrow(
          SoloOwnerPuedeImpersonarError,
        );
      });

      it('[-] callerEsSuperAdmin default (no pasa el arg) → sigue comportamiento OWNER-only (regresión)', async () => {
        memberships.findForImpersonation.mockResolvedValueOnce(null);

        await expect(service.start(ADMIN, TENANT, validDto())).rejects.toThrow(
          SoloOwnerPuedeImpersonarError,
        );
      });

      it('[+] callerEsSuperAdmin = false con adminMembership OWNER → funciona normalmente (regresión positiva)', async () => {
        memberships.findForImpersonation
          .mockResolvedValueOnce(adminOwner())
          .mockResolvedValueOnce(targetContador());

        const result = await service.start(ADMIN, TENANT, validDto(), false);

        expect(result.impersonationToken).toBe('signed.jwt.token');
        // No llama a platformAudit cuando no es cross-tenant
        expect(platformAudit.record).not.toHaveBeenCalled();
      });
    });

    it('expiresAt proviene del clock (determinista: now + 30 min exacto)', async () => {
      const frozenNow = new Date('2026-06-01T12:00:00.000Z');
      clock.setTo(frozenNow);

      memberships.findForImpersonation
        .mockResolvedValueOnce(adminOwner())
        .mockResolvedValueOnce(targetContador());

      const result = await service.start(ADMIN, TENANT, validDto());

      const expectedExpiresAt = new Date(frozenNow.getTime() + 30 * 60 * 1000);
      expect(result.expiresAt).toEqual(expectedExpiresAt);
    });
  });

  describe('end', () => {
    it('cierra la sesión cuando la llama el admin que la inició', async () => {
      repo.findActiveById.mockResolvedValueOnce({
        id: LOG_ID,
        adminUserId: ADMIN,
        targetUserId: TARGET,
      } as unknown as Awaited<ReturnType<RepoMock['findActiveById']>>);

      await service.end(LOG_ID, ADMIN);

      expect(repo.endLog).toHaveBeenCalledWith(LOG_ID);
    });

    it('cierra la sesión cuando la llama el target (opción salirse)', async () => {
      repo.findActiveById.mockResolvedValueOnce({
        id: LOG_ID,
        adminUserId: ADMIN,
        targetUserId: TARGET,
      } as unknown as Awaited<ReturnType<RepoMock['findActiveById']>>);

      await service.end(LOG_ID, TARGET);

      expect(repo.endLog).toHaveBeenCalledWith(LOG_ID);
    });

    it('rechaza si la sesión no existe o ya fue cerrada', async () => {
      repo.findActiveById.mockResolvedValueOnce(null);

      await expect(service.end(LOG_ID, ADMIN)).rejects.toThrow(
        SesionImpersonationNoEncontradaError,
      );
      expect(repo.endLog).not.toHaveBeenCalled();
    });

    it('rechaza si el caller no es admin ni target', async () => {
      repo.findActiveById.mockResolvedValueOnce({
        id: LOG_ID,
        adminUserId: ADMIN,
        targetUserId: TARGET,
      } as unknown as Awaited<ReturnType<RepoMock['findActiveById']>>);

      await expect(service.end(LOG_ID, 'otro-user')).rejects.toThrow(
        NoAutorizadoACerrarSesionError,
      );
      expect(repo.endLog).not.toHaveBeenCalled();
    });
  });

  describe('logAction', () => {
    it('delega al repo', async () => {
      await service.logAction({
        impersonationLogId: LOG_ID,
        action: 'GET /api/asientos',
      });
      expect(repo.logAction).toHaveBeenCalledWith({
        impersonationLogId: LOG_ID,
        action: 'GET /api/asientos',
      });
    });

    it('no propaga errores del repo (auditoría no bloquea respuesta)', async () => {
      repo.logAction.mockRejectedValueOnce(new Error('boom'));
      await expect(
        service.logAction({ impersonationLogId: LOG_ID, action: 'X' }),
      ).resolves.toBeUndefined();
    });
  });
});
