import { Test, TestingModule } from '@nestjs/testing';
import { SystemRole } from '@prisma/client';

import { PrismaService } from '@/common/prisma.service';
import { TenantContextService } from '@/common/tenant-context/tenant-context.service';
import {
  PERMISSIONS_CACHE_INVALIDATION_PORT,
  type PermissionsCacheInvalidationPort,
} from '@/rbac/ports/permissions-cache-invalidation.port';

import {
  AsignacionRolInvalidaError,
  AutoDegradacionOwnerError,
  CustomRoleInvalidoParaTenantError,
  MembershipNoEncontradoError,
  TenantContextRequeridoError,
  UltimoOwnerError,
  UsuarioNoRegistradoParaInviteError,
  UsuarioYaEsMiembroError,
} from './domain/membership-errors';
import { MembershipsService } from './memberships.service';
import {
  MEMBERSHIP_REPOSITORY_PORT,
  type MembershipRepositoryPort,
} from './ports/membership.repository.port';

/**
 * Unit tests de MembershipsService. Cubren el cableado entre el service y
 * los ports (repo + rbac) sin tocar Postgres. La integración contra DB
 * vive en `prisma-membership.repository.integration.spec.ts` y los flujos
 * end-to-end en `test/tenant-isolation.e2e-spec.ts`.
 */
describe('MembershipsService (unit)', () => {
  const TENANT_ID = 'org-a';
  const OTHER_TENANT_ID = 'org-b';
  const USER_ID = 'user-1';
  const ACTOR_USER_ID = 'user-actor';
  const CUSTOM_ROLE_ID = '550e8400-e29b-41d4-a716-446655440000';
  const MEMBERSHIP_ID = '123e4567-e89b-42d3-a456-426614174000';

  type RepoMock = jest.Mocked<MembershipRepositoryPort>;
  type RbacMock = jest.Mocked<PermissionsCacheInvalidationPort>;

  let service: MembershipsService;
  let repo: RepoMock;
  let tenantContext: { getTenantId: jest.Mock };
  let rbac: RbacMock;
  let prisma: {
    user: { findUnique: jest.Mock };
    customRole: { findUnique: jest.Mock };
  };

  beforeEach(async () => {
    repo = {
      create: jest.fn(),
      updateRol: jest.fn(),
      deleteById: jest.fn(),
      deleteByUserAndTenant: jest.fn(),
      findById: jest.fn(),
      findByUserAndTenant: jest.fn(),
      countOwners: jest.fn(),
    } as unknown as RepoMock;
    tenantContext = { getTenantId: jest.fn().mockReturnValue(TENANT_ID) };
    rbac = {
      invalidateUser: jest.fn().mockResolvedValue(undefined),
      invalidateUsersByCustomRole: jest.fn().mockResolvedValue(undefined),
    } as unknown as RbacMock;
    prisma = {
      user: { findUnique: jest.fn() },
      customRole: { findUnique: jest.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MembershipsService,
        { provide: MEMBERSHIP_REPOSITORY_PORT, useValue: repo },
        { provide: PrismaService, useValue: prisma },
        { provide: TenantContextService, useValue: tenantContext },
        { provide: PERMISSIONS_CACHE_INVALIDATION_PORT, useValue: rbac },
      ],
    }).compile();

    service = module.get(MembershipsService);
  });

  // ==========================================================
  // invite
  // ==========================================================

  describe('invite', () => {
    it('crea membership con systemRole e invalida el cache RBAC del nuevo miembro', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: USER_ID,
        email: 'a@b.com',
      });
      repo.findByUserAndTenant.mockResolvedValue(null);
      repo.create.mockResolvedValue({
        id: 'm-new',
      } as Awaited<ReturnType<RepoMock['create']>>);

      const result = await service.invite({
        email: 'a@b.com',
        systemRole: SystemRole.ADMIN,
      });

      expect(repo.create).toHaveBeenCalledWith(TENANT_ID, {
        userId: USER_ID,
        systemRole: SystemRole.ADMIN,
        customRoleId: null,
      });
      expect(rbac.invalidateUser).toHaveBeenCalledWith(USER_ID, TENANT_ID);
      expect(result.id).toBe('m-new');
    });

    it('crea membership con customRoleId si pertenece al tenant', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: USER_ID,
        email: 'a@b.com',
      });
      repo.findByUserAndTenant.mockResolvedValue(null);
      prisma.customRole.findUnique.mockResolvedValue({
        id: CUSTOM_ROLE_ID,
        organizationId: TENANT_ID,
      });
      repo.create.mockResolvedValue({
        id: 'm-new',
      } as Awaited<ReturnType<RepoMock['create']>>);

      await service.invite({ email: 'a@b.com', customRoleId: CUSTOM_ROLE_ID });

      expect(repo.create).toHaveBeenCalledWith(TENANT_ID, {
        userId: USER_ID,
        systemRole: null,
        customRoleId: CUSTOM_ROLE_ID,
      });
    });

    it('lanza TenantContextRequeridoError si no hay tenant activo', async () => {
      tenantContext.getTenantId.mockReturnValue(null);
      await expect(
        service.invite({ email: 'a@b.com', systemRole: SystemRole.ADMIN }),
      ).rejects.toBeInstanceOf(TenantContextRequeridoError);
    });

    it('lanza UsuarioNoRegistradoParaInviteError si el user no existe', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(
        service.invite({ email: 'new@user.com', systemRole: SystemRole.ADMIN }),
      ).rejects.toBeInstanceOf(UsuarioNoRegistradoParaInviteError);
    });

    it('lanza UsuarioYaEsMiembroError si el user ya es miembro', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: USER_ID,
        email: 'a@b.com',
      });
      repo.findByUserAndTenant.mockResolvedValue({
        id: 'm-existing',
      } as Awaited<ReturnType<RepoMock['findByUserAndTenant']>>);
      await expect(
        service.invite({ email: 'a@b.com', systemRole: SystemRole.ADMIN }),
      ).rejects.toBeInstanceOf(UsuarioYaEsMiembroError);
    });

    it('lanza CustomRoleInvalidoParaTenantError si el customRoleId vive en otro tenant', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: USER_ID,
        email: 'a@b.com',
      });
      repo.findByUserAndTenant.mockResolvedValue(null);
      prisma.customRole.findUnique.mockResolvedValue({
        id: CUSTOM_ROLE_ID,
        organizationId: OTHER_TENANT_ID,
      });
      await expect(
        service.invite({ email: 'a@b.com', customRoleId: CUSTOM_ROLE_ID }),
      ).rejects.toBeInstanceOf(CustomRoleInvalidoParaTenantError);
    });

    it('lanza CustomRoleInvalidoParaTenantError si el customRoleId no existe', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: USER_ID,
        email: 'a@b.com',
      });
      repo.findByUserAndTenant.mockResolvedValue(null);
      prisma.customRole.findUnique.mockResolvedValue(null);
      await expect(
        service.invite({ email: 'a@b.com', customRoleId: CUSTOM_ROLE_ID }),
      ).rejects.toBeInstanceOf(CustomRoleInvalidoParaTenantError);
    });

    it('lanza AsignacionRolInvalidaError si no hay ni systemRole ni customRoleId', async () => {
      await expect(service.invite({ email: 'a@b.com' })).rejects.toBeInstanceOf(
        AsignacionRolInvalidaError,
      );
    });

    it('lanza AsignacionRolInvalidaError si vienen ambos', async () => {
      await expect(
        service.invite({
          email: 'a@b.com',
          systemRole: SystemRole.ADMIN,
          customRoleId: CUSTOM_ROLE_ID,
        }),
      ).rejects.toBeInstanceOf(AsignacionRolInvalidaError);
    });

    it('normaliza el email (lowercase + trim) antes del lookup', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: USER_ID,
        email: 'a@b.com',
      });
      repo.findByUserAndTenant.mockResolvedValue(null);
      repo.create.mockResolvedValue({
        id: 'm-new',
      } as Awaited<ReturnType<RepoMock['create']>>);

      await service.invite({
        email: '  A@B.COM  ',
        systemRole: SystemRole.ADMIN,
      });

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { email: 'a@b.com' },
      });
    });
  });

  // ==========================================================
  // updateRole
  // ==========================================================

  describe('updateRole', () => {
    const baseMembership = () => ({
      id: MEMBERSHIP_ID,
      organizationId: TENANT_ID,
      userId: USER_ID,
      systemRole: SystemRole.ADMIN,
      customRoleId: null as string | null,
      deactivatedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    it('actualiza el rol e invalida el cache del miembro', async () => {
      repo.findById.mockResolvedValue(
        baseMembership() as Awaited<ReturnType<RepoMock['findById']>>,
      );
      repo.updateRol.mockResolvedValue({
        ...baseMembership(),
        systemRole: SystemRole.OWNER,
      } as Awaited<ReturnType<RepoMock['updateRol']>>);

      await service.updateRole(
        MEMBERSHIP_ID,
        { systemRole: SystemRole.OWNER, customRoleId: null },
        ACTOR_USER_ID,
      );

      expect(repo.updateRol).toHaveBeenCalledWith(TENANT_ID, MEMBERSHIP_ID, {
        systemRole: SystemRole.OWNER,
        customRoleId: null,
      });
      expect(rbac.invalidateUser).toHaveBeenCalledWith(USER_ID, TENANT_ID);
    });

    it('lanza MembershipNoEncontradoError si no existe en el tenant', async () => {
      repo.findById.mockResolvedValue(null);
      await expect(
        service.updateRole(
          MEMBERSHIP_ID,
          { systemRole: SystemRole.OWNER, customRoleId: null },
          ACTOR_USER_ID,
        ),
      ).rejects.toBeInstanceOf(MembershipNoEncontradoError);
    });

    it('lanza AutoDegradacionOwnerError si el actor quiere degradarse a sí mismo desde OWNER', async () => {
      repo.findById.mockResolvedValue({
        ...baseMembership(),
        userId: ACTOR_USER_ID,
        systemRole: SystemRole.OWNER,
      } as Awaited<ReturnType<RepoMock['findById']>>);

      await expect(
        service.updateRole(
          MEMBERSHIP_ID,
          { systemRole: SystemRole.ADMIN, customRoleId: null },
          ACTOR_USER_ID,
        ),
      ).rejects.toBeInstanceOf(AutoDegradacionOwnerError);
      expect(repo.updateRol).not.toHaveBeenCalled();
    });

    it('permite cambiar de OWNER a OWNER sobre sí mismo (idempotente)', async () => {
      repo.findById.mockResolvedValue({
        ...baseMembership(),
        userId: ACTOR_USER_ID,
        systemRole: SystemRole.OWNER,
      } as Awaited<ReturnType<RepoMock['findById']>>);
      repo.updateRol.mockResolvedValue({
        ...baseMembership(),
        userId: ACTOR_USER_ID,
        systemRole: SystemRole.OWNER,
      } as Awaited<ReturnType<RepoMock['updateRol']>>);

      await service.updateRole(
        MEMBERSHIP_ID,
        { systemRole: SystemRole.OWNER, customRoleId: null },
        ACTOR_USER_ID,
      );

      expect(repo.updateRol).toHaveBeenCalled();
    });

    it('lanza CustomRoleInvalidoParaTenantError si el customRoleId no es del tenant', async () => {
      repo.findById.mockResolvedValue(
        baseMembership() as Awaited<ReturnType<RepoMock['findById']>>,
      );
      prisma.customRole.findUnique.mockResolvedValue({
        id: CUSTOM_ROLE_ID,
        organizationId: OTHER_TENANT_ID,
      });

      await expect(
        service.updateRole(
          MEMBERSHIP_ID,
          { systemRole: null, customRoleId: CUSTOM_ROLE_ID },
          ACTOR_USER_ID,
        ),
      ).rejects.toBeInstanceOf(CustomRoleInvalidoParaTenantError);
    });
  });

  // ==========================================================
  // remove
  // ==========================================================

  describe('remove', () => {
    const adminMembership = () => ({
      id: MEMBERSHIP_ID,
      organizationId: TENANT_ID,
      userId: USER_ID,
      systemRole: SystemRole.ADMIN,
      customRoleId: null as string | null,
      deactivatedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    it('elimina un ADMIN sin chequear cantidad de owners', async () => {
      repo.findById.mockResolvedValue(
        adminMembership() as Awaited<ReturnType<RepoMock['findById']>>,
      );
      repo.deleteById.mockResolvedValue(
        adminMembership() as Awaited<ReturnType<RepoMock['deleteById']>>,
      );

      await service.remove(MEMBERSHIP_ID, ACTOR_USER_ID);

      expect(repo.countOwners).not.toHaveBeenCalled();
      expect(repo.deleteById).toHaveBeenCalledWith(TENANT_ID, MEMBERSHIP_ID);
      expect(rbac.invalidateUser).toHaveBeenCalledWith(USER_ID, TENANT_ID);
    });

    it('elimina un OWNER si queda más de uno', async () => {
      repo.findById.mockResolvedValue({
        ...adminMembership(),
        systemRole: SystemRole.OWNER,
      } as Awaited<ReturnType<RepoMock['findById']>>);
      repo.countOwners.mockResolvedValue(2);
      repo.deleteById.mockResolvedValue({
        ...adminMembership(),
        systemRole: SystemRole.OWNER,
      } as Awaited<ReturnType<RepoMock['deleteById']>>);

      await service.remove(MEMBERSHIP_ID, ACTOR_USER_ID);

      expect(repo.deleteById).toHaveBeenCalled();
    });

    it('lanza UltimoOwnerError si es el único OWNER', async () => {
      repo.findById.mockResolvedValue({
        ...adminMembership(),
        systemRole: SystemRole.OWNER,
      } as Awaited<ReturnType<RepoMock['findById']>>);
      repo.countOwners.mockResolvedValue(1);

      await expect(
        service.remove(MEMBERSHIP_ID, ACTOR_USER_ID),
      ).rejects.toBeInstanceOf(UltimoOwnerError);
      expect(repo.deleteById).not.toHaveBeenCalled();
    });

    it('lanza MembershipNoEncontradoError si no existe en el tenant', async () => {
      repo.findById.mockResolvedValue(null);
      await expect(
        service.remove(MEMBERSHIP_ID, ACTOR_USER_ID),
      ).rejects.toBeInstanceOf(MembershipNoEncontradoError);
    });
  });

  // ==========================================================
  // leave
  // ==========================================================

  describe('leave', () => {
    const adminMembership = () => ({
      id: MEMBERSHIP_ID,
      organizationId: TENANT_ID,
      userId: USER_ID,
      systemRole: SystemRole.ADMIN,
      customRoleId: null as string | null,
      deactivatedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    it('elimina la membership del user y invalida su cache RBAC', async () => {
      repo.findByUserAndTenant.mockResolvedValue(
        adminMembership() as Awaited<
          ReturnType<RepoMock['findByUserAndTenant']>
        >,
      );
      repo.deleteByUserAndTenant.mockResolvedValue(
        adminMembership() as Awaited<
          ReturnType<RepoMock['deleteByUserAndTenant']>
        >,
      );

      await service.leave(TENANT_ID, USER_ID);

      expect(repo.deleteByUserAndTenant).toHaveBeenCalledWith(
        TENANT_ID,
        USER_ID,
      );
      expect(rbac.invalidateUser).toHaveBeenCalledWith(USER_ID, TENANT_ID);
    });

    it('lanza UltimoOwnerError si el user es el único OWNER', async () => {
      repo.findByUserAndTenant.mockResolvedValue({
        ...adminMembership(),
        systemRole: SystemRole.OWNER,
      } as Awaited<ReturnType<RepoMock['findByUserAndTenant']>>);
      repo.countOwners.mockResolvedValue(1);

      await expect(service.leave(TENANT_ID, USER_ID)).rejects.toBeInstanceOf(
        UltimoOwnerError,
      );
      expect(repo.deleteByUserAndTenant).not.toHaveBeenCalled();
    });

    it('lanza MembershipNoEncontradoError si el user no tiene membership activa', async () => {
      repo.findByUserAndTenant.mockResolvedValue(null);
      await expect(service.leave(TENANT_ID, USER_ID)).rejects.toBeInstanceOf(
        MembershipNoEncontradoError,
      );
    });
  });
});
