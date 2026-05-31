import { Test, TestingModule } from '@nestjs/testing';
import { SystemRole } from '@prisma/client';

import {
  CUSTOM_ROLES_READER_PORT,
  type CustomRolesReaderPort,
} from '@/custom-roles/ports/custom-roles-reader.port';
import { TenantContextService } from '@/common/tenant-context/tenant-context.service';
import {
  PERMISSIONS_CACHE_INVALIDATION_PORT,
  type PermissionsCacheInvalidationPort,
} from '@/rbac/ports/permissions-cache-invalidation.port';
import { RbacService } from '@/rbac/rbac.service';
import { USERS_READER_PORT, type UsersReaderPort } from '@/users/ports/users-reader.port';

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
import { AssignableRoleDto } from './dto/assignable-role.dto';
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
  const USER_ID = 'user-1';
  const ACTOR_USER_ID = 'user-actor';
  const CUSTOM_ROLE_ID = '550e8400-e29b-41d4-a716-446655440000';
  const MEMBERSHIP_ID = '123e4567-e89b-42d3-a456-426614174000';

  type RepoMock = jest.Mocked<MembershipRepositoryPort>;
  type RbacMock = jest.Mocked<PermissionsCacheInvalidationPort>;
  type RbacServiceMock = jest.Mocked<Pick<RbacService, 'resolverPermisosConContexto'>>;
  type CustomRolesMock = jest.Mocked<CustomRolesReaderPort>;
  type UsersReaderMock = jest.Mocked<UsersReaderPort>;

  let service: MembershipsService;
  let repo: RepoMock;
  let tenantContext: { getTenantId: jest.Mock };
  let rbac: RbacMock;
  let rbacService: RbacServiceMock;
  let customRoles: CustomRolesMock;
  let users: UsersReaderMock;

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
    rbacService = {
      resolverPermisosConContexto: jest.fn(),
    } as unknown as RbacServiceMock;
    customRoles = {
      belongsToTenant: jest.fn(),
      listarAsignablesPorOrg: jest.fn(),
    } as unknown as CustomRolesMock;
    users = {
      findByEmail: jest.fn(),
      findMinimalByEmail: jest.fn(),
    } as unknown as UsersReaderMock;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MembershipsService,
        { provide: MEMBERSHIP_REPOSITORY_PORT, useValue: repo },
        { provide: CUSTOM_ROLES_READER_PORT, useValue: customRoles },
        { provide: USERS_READER_PORT, useValue: users },
        { provide: TenantContextService, useValue: tenantContext },
        { provide: PERMISSIONS_CACHE_INVALIDATION_PORT, useValue: rbac },
        { provide: RbacService, useValue: rbacService },
      ],
    }).compile();

    service = module.get(MembershipsService);
  });

  // ==========================================================
  // invite
  // ==========================================================

  describe('invite', () => {
    it('crea membership con systemRole e invalida el cache RBAC del nuevo miembro', async () => {
      users.findMinimalByEmail.mockResolvedValue({
        id: USER_ID,
        displayName: null,
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
      users.findMinimalByEmail.mockResolvedValue({
        id: USER_ID,
        displayName: null,
        email: 'a@b.com',
      });
      repo.findByUserAndTenant.mockResolvedValue(null);
      customRoles.belongsToTenant.mockResolvedValue(true);
      repo.create.mockResolvedValue({
        id: 'm-new',
      } as Awaited<ReturnType<RepoMock['create']>>);

      await service.invite({ email: 'a@b.com', customRoleId: CUSTOM_ROLE_ID });

      expect(customRoles.belongsToTenant).toHaveBeenCalledWith(CUSTOM_ROLE_ID, TENANT_ID);
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
      users.findMinimalByEmail.mockResolvedValue(null);
      await expect(
        service.invite({ email: 'new@user.com', systemRole: SystemRole.ADMIN }),
      ).rejects.toBeInstanceOf(UsuarioNoRegistradoParaInviteError);
    });

    it('lanza UsuarioYaEsMiembroError si el user ya es miembro', async () => {
      users.findMinimalByEmail.mockResolvedValue({
        id: USER_ID,
        displayName: null,
        email: 'a@b.com',
      });
      repo.findByUserAndTenant.mockResolvedValue({
        id: 'm-existing',
      } as Awaited<ReturnType<RepoMock['findByUserAndTenant']>>);
      await expect(
        service.invite({ email: 'a@b.com', systemRole: SystemRole.ADMIN }),
      ).rejects.toBeInstanceOf(UsuarioYaEsMiembroError);
    });

    it('lanza CustomRoleInvalidoParaTenantError si belongsToTenant retorna false', async () => {
      // El adapter retorna false tanto para "no existe" como para "otro tenant"
      // (ver doc del reader port). El service no distingue los dos casos.
      users.findMinimalByEmail.mockResolvedValue({
        id: USER_ID,
        displayName: null,
        email: 'a@b.com',
      });
      repo.findByUserAndTenant.mockResolvedValue(null);
      customRoles.belongsToTenant.mockResolvedValue(false);
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
      users.findMinimalByEmail.mockResolvedValue({
        id: USER_ID,
        displayName: null,
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

      expect(users.findMinimalByEmail).toHaveBeenCalledWith('a@b.com');
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

    it('lanza CustomRoleInvalidoParaTenantError si belongsToTenant retorna false', async () => {
      repo.findById.mockResolvedValue(
        baseMembership() as Awaited<ReturnType<RepoMock['findById']>>,
      );
      customRoles.belongsToTenant.mockResolvedValue(false);

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

      await expect(service.remove(MEMBERSHIP_ID, ACTOR_USER_ID)).rejects.toBeInstanceOf(
        UltimoOwnerError,
      );
      expect(repo.deleteById).not.toHaveBeenCalled();
    });

    it('lanza MembershipNoEncontradoError si no existe en el tenant', async () => {
      repo.findById.mockResolvedValue(null);
      await expect(service.remove(MEMBERSHIP_ID, ACTOR_USER_ID)).rejects.toBeInstanceOf(
        MembershipNoEncontradoError,
      );
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
        adminMembership() as Awaited<ReturnType<RepoMock['findByUserAndTenant']>>,
      );
      repo.deleteByUserAndTenant.mockResolvedValue(
        adminMembership() as Awaited<ReturnType<RepoMock['deleteByUserAndTenant']>>,
      );

      await service.leave(TENANT_ID, USER_ID);

      expect(repo.deleteByUserAndTenant).toHaveBeenCalledWith(TENANT_ID, USER_ID);
      expect(rbac.invalidateUser).toHaveBeenCalledWith(USER_ID, TENANT_ID);
    });

    it('lanza UltimoOwnerError si el user es el único OWNER', async () => {
      repo.findByUserAndTenant.mockResolvedValue({
        ...adminMembership(),
        systemRole: SystemRole.OWNER,
      } as Awaited<ReturnType<RepoMock['findByUserAndTenant']>>);
      repo.countOwners.mockResolvedValue(1);

      await expect(service.leave(TENANT_ID, USER_ID)).rejects.toBeInstanceOf(UltimoOwnerError);
      expect(repo.deleteByUserAndTenant).not.toHaveBeenCalled();
    });

    it('lanza MembershipNoEncontradoError si el user no tiene membership activa', async () => {
      repo.findByUserAndTenant.mockResolvedValue(null);
      await expect(service.leave(TENANT_ID, USER_ID)).rejects.toBeInstanceOf(
        MembershipNoEncontradoError,
      );
    });
  });

  // ==========================================================
  // listarRolesAsignables
  // ==========================================================

  describe('listarRolesAsignables', () => {
    const CUSTOM_ROLE_A = { id: 'uuid-a', name: 'Auditor', slug: 'auditor' };
    const CUSTOM_ROLE_B = { id: 'uuid-b', name: 'Contador', slug: 'contador' };

    it('OWNER consulta — respuesta incluye OWNER + ADMIN + custom roles del tenant', async () => {
      rbacService.resolverPermisosConContexto.mockResolvedValue({
        permissions: [],
        isOwner: true,
      });
      customRoles.listarAsignablesPorOrg.mockResolvedValue([CUSTOM_ROLE_A, CUSTOM_ROLE_B]);

      const result = await service.listarRolesAsignables(TENANT_ID, USER_ID);

      expect(result).toHaveLength(4);
      expect(result[0]).toMatchObject({ id: 'OWNER', kind: 'system' });
      expect(result[1]).toMatchObject({ id: 'ADMIN', kind: 'system' });
      expect(result[2]).toMatchObject({ id: 'uuid-a', kind: 'custom' });
      expect(result[3]).toMatchObject({ id: 'uuid-b', kind: 'custom' });
      expect(customRoles.listarAsignablesPorOrg).toHaveBeenCalledWith(TENANT_ID);
    });

    it('ADMIN consulta — respuesta NO incluye OWNER, SÍ incluye ADMIN y custom roles', async () => {
      rbacService.resolverPermisosConContexto.mockResolvedValue({
        permissions: [],
        isOwner: false,
      });
      customRoles.listarAsignablesPorOrg.mockResolvedValue([CUSTOM_ROLE_A]);

      const result = await service.listarRolesAsignables(TENANT_ID, USER_ID);

      expect(result.find((r) => r.id === 'OWNER')).toBeUndefined();
      expect(result.find((r) => r.id === 'ADMIN')).toBeDefined();
      expect(result.find((r) => r.id === 'uuid-a')).toBeDefined();
    });

    it('MEMBER con permiso pero sin ser owner — sin OWNER, con ADMIN y custom roles', async () => {
      rbacService.resolverPermisosConContexto.mockResolvedValue({
        permissions: ['organizacion.miembros.invite'],
        isOwner: false,
      });
      customRoles.listarAsignablesPorOrg.mockResolvedValue([CUSTOM_ROLE_B]);

      const result = await service.listarRolesAsignables(TENANT_ID, USER_ID);

      expect(result.find((r) => r.id === 'OWNER')).toBeUndefined();
      expect(result.find((r) => r.id === 'ADMIN')).toBeDefined();
      expect(result.find((r) => r.id === 'uuid-b')).toBeDefined();
    });

    it('system roles aparecen primero, luego custom roles (orden REQ-RA-01)', async () => {
      rbacService.resolverPermisosConContexto.mockResolvedValue({
        permissions: [],
        isOwner: false,
      });
      customRoles.listarAsignablesPorOrg.mockResolvedValue([CUSTOM_ROLE_A, CUSTOM_ROLE_B]);

      const result = await service.listarRolesAsignables(TENANT_ID, USER_ID);

      const systemItems = result.filter((r: AssignableRoleDto) => r.kind === 'system');
      const customItems = result.filter((r: AssignableRoleDto) => r.kind === 'custom');
      const lastSystemItem = systemItems[systemItems.length - 1];
      const lastSystemIndex = result.findIndex(
        (r: AssignableRoleDto) => r.id === lastSystemItem?.id,
      );
      const firstCustomIndex = result.findIndex(
        (r: AssignableRoleDto) => r.id === customItems[0]?.id,
      );
      expect(lastSystemIndex).toBeLessThan(firstCustomIndex);
    });

    it('custom roles se consultan con el orgId correcto — REQ-RA-04', async () => {
      rbacService.resolverPermisosConContexto.mockResolvedValue({
        permissions: [],
        isOwner: false,
      });
      customRoles.listarAsignablesPorOrg.mockResolvedValue([]);

      await service.listarRolesAsignables(TENANT_ID, USER_ID);

      expect(customRoles.listarAsignablesPorOrg).toHaveBeenCalledWith(TENANT_ID);
    });

    it('seam filtrarPorVerticalYPacks no filtra ningún rol (no-op hoy — REQ-RA-05)', async () => {
      rbacService.resolverPermisosConContexto.mockResolvedValue({
        permissions: [],
        isOwner: true,
      });
      customRoles.listarAsignablesPorOrg.mockResolvedValue([CUSTOM_ROLE_A, CUSTOM_ROLE_B]);

      const result = await service.listarRolesAsignables(TENANT_ID, USER_ID);

      // Con OWNER: OWNER + ADMIN + 2 custom = 4 ítems; el seam no filtra ninguno.
      expect(result).toHaveLength(4);
    });
  });
});
