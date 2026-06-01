import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { SystemRole } from '@prisma/client';

import { CLOCK_PORT } from '@/common/clock/clock.port';
import { FakeClockAdapter } from '@/common/clock/fake-clock.adapter';
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
import { RbacService } from '@/rbac/rbac.service';
import { GoneException } from '@nestjs/common';
import { PrismaService } from '@/common/prisma.service';

import { InvitacionAsignacionOwnerNoPermitidaError } from './domain/invitation-errors';
import { InvitationsService } from './invitations.service';
import {
  INVITATION_REPOSITORY_PORT,
  InvitationRepositoryPort,
} from './ports/invitation.repository.port';

/**
 * Tests unitarios de InvitationsService — cubren reglas de negocio puras
 * sin tocar Postgres. La integración contra BD vive en `test/invitations.e2e-spec.ts`.
 */
describe('InvitationsService (unit)', () => {
  const ORG_ID = 'org-abc';
  const OWNER_ID = 'user-owner';
  const ADMIN_ID = 'user-admin';
  const CUSTOM_ROLE_ID = '550e8400-e29b-41d4-a716-446655440000';

  type RepoMock = jest.Mocked<InvitationRepositoryPort>;
  type EmailsMock = jest.Mocked<InvitationEmailsPort>;
  type RbacInvalidationMock = jest.Mocked<PermissionsCacheInvalidationPort>;
  type CustomRolesMock = jest.Mocked<CustomRolesReaderPort>;

  let service: InvitationsService;
  let repo: RepoMock;
  let emails: EmailsMock;
  let rbacInvalidation: RbacInvalidationMock;
  let customRoles: CustomRolesMock;
  let rbacService: { resolverPermisosConContexto: jest.Mock };
  let prisma: {
    user: { findUnique: jest.Mock };
    organization: { findUnique: jest.Mock };
    membership: { findUnique: jest.Mock };
  };
  let config: { get: jest.Mock };
  let clock: FakeClockAdapter;

  beforeEach(async () => {
    repo = {
      create: jest.fn(),
      findByTokenHash: jest.fn(),
      findById: jest.fn(),
      listByOrganization: jest.fn(),
      markAccepted: jest.fn(),
      markRevoked: jest.fn(),
      findActivePendingForEmail: jest.fn().mockResolvedValue(null),
    } as unknown as RepoMock;

    emails = {
      sendInviteEmail: jest.fn().mockResolvedValue(undefined),
    } as unknown as EmailsMock;

    rbacInvalidation = {
      invalidateUser: jest.fn().mockResolvedValue(undefined),
      invalidateUsersByCustomRole: jest.fn().mockResolvedValue(undefined),
    } as unknown as RbacInvalidationMock;

    customRoles = {
      belongsToTenant: jest.fn().mockResolvedValue(true),
    } as unknown as CustomRolesMock;

    rbacService = {
      resolverPermisosConContexto: jest.fn(),
    };

    // Prisma stub mínimo para el flujo happy-path de create
    prisma = {
      user: { findUnique: jest.fn() },
      organization: { findUnique: jest.fn() },
      membership: { findUnique: jest.fn().mockResolvedValue(null) },
    };

    config = {
      get: jest.fn().mockReturnValue('http://localhost:3000'),
    };
    clock = new FakeClockAdapter();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InvitationsService,
        { provide: INVITATION_REPOSITORY_PORT, useValue: repo },
        { provide: INVITATION_EMAILS_PORT, useValue: emails },
        { provide: PERMISSIONS_CACHE_INVALIDATION_PORT, useValue: rbacInvalidation },
        { provide: CUSTOM_ROLES_READER_PORT, useValue: customRoles },
        { provide: RbacService, useValue: rbacService },
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: config },
        { provide: CLOCK_PORT, useValue: clock },
      ],
    }).compile();

    service = module.get(InvitationsService);
  });

  // ============================================================
  // Escalada de privilegios — regla: solo OWNER puede asignar OWNER
  // ============================================================

  describe('create() — validación de escalada de privilegios al asignar OWNER', () => {
    it('invitador NO-OWNER asignando systemRole OWNER → lanza InvitacionAsignacionOwnerNoPermitidaError (403)', async () => {
      // Un ADMIN intenta invitar a alguien como OWNER
      rbacService.resolverPermisosConContexto.mockResolvedValue({
        permissions: ['organizacion.miembros.invite'],
        isOwner: false,
      });

      await expect(
        service.create(ORG_ID, ADMIN_ID, { email: 'nuevo@test.bo', systemRole: SystemRole.OWNER }),
      ).rejects.toBeInstanceOf(InvitacionAsignacionOwnerNoPermitidaError);

      expect(rbacService.resolverPermisosConContexto).toHaveBeenCalledWith(ADMIN_ID, ORG_ID);
      // No debe haber persistido nada
      expect(repo.create).not.toHaveBeenCalled();
    });

    it('invitador OWNER asignando systemRole OWNER → OK (invitación creada)', async () => {
      rbacService.resolverPermisosConContexto.mockResolvedValue({
        permissions: ['*'],
        isOwner: true,
      });

      // Stub del flujo happy-path de create
      prisma.user.findUnique.mockResolvedValue(null); // no existe el email como user
      prisma.organization.findUnique.mockResolvedValue({ name: 'Org Test' });
      // inviter lookup (segundo findUnique en el service)
      prisma.user.findUnique
        .mockResolvedValueOnce(null) // primera llamada: busca si el email ya existe como user
        .mockResolvedValueOnce({ displayName: 'Owner User', email: 'owner@test.bo' }); // segunda: busca inviter

      repo.create.mockResolvedValue({
        id: 'inv-1',
        organizationId: ORG_ID,
        email: 'nuevo@test.bo',
        status: 'PENDING',
      } as ReturnType<RepoMock['create']> extends Promise<infer R> ? R : never);

      const result = await service.create(ORG_ID, OWNER_ID, {
        email: 'nuevo@test.bo',
        systemRole: SystemRole.OWNER,
      });

      expect(result.invitation.id).toBe('inv-1');
      expect(repo.create).toHaveBeenCalled();
    });

    it('invitador NO-OWNER asignando systemRole ADMIN → OK (no se bloquea)', async () => {
      rbacService.resolverPermisosConContexto.mockResolvedValue({
        permissions: ['organizacion.miembros.invite'],
        isOwner: false,
      });

      prisma.user.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ displayName: 'Admin User', email: 'admin@test.bo' });
      prisma.organization.findUnique.mockResolvedValue({ name: 'Org Test' });

      repo.create.mockResolvedValue({
        id: 'inv-2',
        organizationId: ORG_ID,
        email: 'nuevo@test.bo',
        status: 'PENDING',
      } as ReturnType<RepoMock['create']> extends Promise<infer R> ? R : never);

      const result = await service.create(ORG_ID, ADMIN_ID, {
        email: 'nuevo@test.bo',
        systemRole: SystemRole.ADMIN,
      });

      expect(result.invitation.id).toBe('inv-2');
      expect(repo.create).toHaveBeenCalled();
    });

    it('invitador NO-OWNER asignando customRoleId → OK (no se bloquea)', async () => {
      rbacService.resolverPermisosConContexto.mockResolvedValue({
        permissions: ['organizacion.miembros.invite'],
        isOwner: false,
      });

      prisma.user.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ displayName: 'Admin User', email: 'admin@test.bo' });
      prisma.organization.findUnique.mockResolvedValue({ name: 'Org Test' });
      customRoles.belongsToTenant.mockResolvedValue(true);

      repo.create.mockResolvedValue({
        id: 'inv-3',
        organizationId: ORG_ID,
        email: 'nuevo@test.bo',
        status: 'PENDING',
      } as ReturnType<RepoMock['create']> extends Promise<infer R> ? R : never);

      const result = await service.create(ORG_ID, ADMIN_ID, {
        email: 'nuevo@test.bo',
        customRoleId: CUSTOM_ROLE_ID,
      });

      expect(result.invitation.id).toBe('inv-3');
      expect(repo.create).toHaveBeenCalled();
      // No se verifica isOwner para customRoleId
      expect(rbacService.resolverPermisosConContexto).not.toHaveBeenCalled();
    });
  });

  // ============================================================
  // Expiración de invitación — comportamiento determinista vía clock
  // ============================================================

  describe('lookupValidInvitation — expiración controlada por clock', () => {
    const buildInvitacionExpirada = (expiresAt: Date) =>
      ({
        id: 'inv-expired',
        organizationId: ORG_ID,
        email: 'target@test.bo',
        status: 'PENDING' as const,
        expiresAt,
        invitedById: ADMIN_ID,
        systemRole: null,
        customRoleId: null,
        tokenHash: 'hash',
        acceptedAt: null,
        acceptedByUserId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        organization: { id: ORG_ID, slug: 'org-slug', name: 'Org Test' },
        invitedBy: { id: ADMIN_ID, email: 'admin@test.bo', displayName: 'Admin' },
      }) as unknown as ReturnType<RepoMock['findByTokenHash']> extends Promise<infer R> ? R : never;

    it('invitación con expiresAt en el pasado → aceptar lanza GoneException("La invitación expiró")', async () => {
      const frozenNow = new Date('2026-06-15T12:00:00.000Z');
      clock.setTo(frozenNow);

      // expiresAt es un segundo antes que el "ahora" del reloj
      const pastExpiry = new Date(frozenNow.getTime() - 1000);
      repo.findByTokenHash.mockResolvedValue(buildInvitacionExpirada(pastExpiry));

      await expect(service.acceptWithExistingUser('any-token', 'user-abc')).rejects.toBeInstanceOf(
        GoneException,
      );

      await expect(service.acceptWithExistingUser('any-token', 'user-abc')).rejects.toThrow(
        'La invitación expiró',
      );
    });

    it('invitación con expiresAt en el futuro → no lanza GoneException por expiración', async () => {
      const frozenNow = new Date('2026-06-15T12:00:00.000Z');
      clock.setTo(frozenNow);

      // expiresAt es un segundo después que el "ahora" del reloj
      const futureExpiry = new Date(frozenNow.getTime() + 1000);
      repo.findByTokenHash.mockResolvedValue(buildInvitacionExpirada(futureExpiry));

      // El flujo sigue adelante (falla en otro punto — usuario no encontrado)
      // Lo importante es que NO falla con el GoneException de expiración
      await expect(service.acceptWithExistingUser('any-token', 'user-abc')).rejects.not.toThrow(
        'La invitación expiró',
      );
    });
  });
});
