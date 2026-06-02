import { Test, TestingModule } from '@nestjs/testing';

import type { ContextoAsignable } from '@/common/permisos/catalogo-asignable';
import { CatalogoAsignableResolver } from '@/permissions/catalogo-asignable.resolver';
import {
  PERMISSIONS_CACHE_INVALIDATION_PORT,
  type PermissionsCacheInvalidationPort,
} from '@/rbac/ports/permissions-cache-invalidation.port';

import { CustomRolesService } from './custom-roles.service';
import {
  CustomRoleConMiembrosActivosError,
  CustomRoleDelSistemaError,
  CustomRoleNoEditableError,
  CustomRoleNoEncontradoError,
  CustomRoleSlugDuplicadoError,
  PermisoDesconocidoError,
  PermisoInvalidoError,
  PermisoNoHabilitadoError,
} from './domain/custom-role-errors';
import {
  CUSTOM_ROLE_REPOSITORY_PORT,
  type CustomRoleRepositoryPort,
} from './ports/custom-role.repository.port';

/**
 * Unit tests de CustomRolesService. Cubren el cableado al repo port
 * y las transiciones a domain errors sin tocar DB. La cobertura de
 * flujos E2E (permisos inexistentes, wildcards inválidos) vive en
 * `test/custom-roles.e2e-spec.ts`.
 */
describe('CustomRolesService (unit)', () => {
  const TENANT_ID = 'org-a';
  const ROLE_ID = '550e8400-e29b-41d4-a716-446655440000';
  const ACTOR_USER_ID = 'user-actor';

  type RepoMock = jest.Mocked<CustomRoleRepositoryPort>;
  type RbacMock = jest.Mocked<PermissionsCacheInvalidationPort>;
  type ResolverMock = jest.Mocked<Pick<CatalogoAsignableResolver, 'resolver'>>;

  // Contexto por defecto: org de CONTABILIDAD sin packs (catálogo de packs vacío)
  // → todos los submódulos de contabilidad son core/asignables. Los tests del
  // candado de pack sobreescriben este contexto. Se usa `contabilidad.ventas`
  // como submódulo "pack" en esos tests porque SÍ tiene permisos en el catálogo
  // (contabilidad.adjuntos es placeholder sin permisos todavía).
  const CTX_CONTABILIDAD: ContextoAsignable = {
    vertical: 'CONTABILIDAD',
    packsCatalogo: [],
    packsActivos: [],
  };

  let service: CustomRolesService;
  let repo: RepoMock;
  let rbac: RbacMock;
  let resolver: ResolverMock;

  const baseRole = () => ({
    id: ROLE_ID,
    organizationId: TENANT_ID,
    slug: 'contador',
    name: 'Contador',
    description: null,
    permissions: ['contabilidad.ventas.read'],
    createdById: ACTOR_USER_ID,
    isSystemDefault: false,
    isEditable: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  beforeEach(async () => {
    repo = {
      list: jest.fn(),
      findById: jest.fn(),
      findBySlug: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      countActiveMembers: jest.fn(),
      listAffectedUserIds: jest.fn(),
      listMembersWithUsers: jest.fn(),
    } as unknown as RepoMock;
    rbac = {
      invalidateUser: jest.fn().mockResolvedValue(undefined),
      invalidateUsersByCustomRole: jest.fn().mockResolvedValue(undefined),
    } as unknown as RbacMock;
    resolver = {
      resolver: jest.fn().mockResolvedValue(CTX_CONTABILIDAD),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CustomRolesService,
        { provide: CUSTOM_ROLE_REPOSITORY_PORT, useValue: repo },
        { provide: PERMISSIONS_CACHE_INVALIDATION_PORT, useValue: rbac },
        { provide: CatalogoAsignableResolver, useValue: resolver },
      ],
    }).compile();

    service = module.get(CustomRolesService);
  });

  // ==========================================================
  // findById
  // ==========================================================

  describe('findById', () => {
    it('retorna el rol si pertenece al tenant', async () => {
      repo.findById.mockResolvedValue(baseRole() as Awaited<ReturnType<RepoMock['findById']>>);
      const role = await service.findById(TENANT_ID, ROLE_ID);
      expect(role.id).toBe(ROLE_ID);
    });

    it('lanza CustomRoleNoEncontradoError si el rol no existe', async () => {
      repo.findById.mockResolvedValue(null);
      await expect(service.findById(TENANT_ID, ROLE_ID)).rejects.toBeInstanceOf(
        CustomRoleNoEncontradoError,
      );
    });

    it('lanza CustomRoleNoEncontradoError si el rol vive en otro tenant (repo devuelve null)', async () => {
      // El repo ya filtra por organizationId; cuando el id no matchea la org, devuelve null.
      repo.findById.mockResolvedValue(null);
      await expect(service.findById(TENANT_ID, ROLE_ID)).rejects.toBeInstanceOf(
        CustomRoleNoEncontradoError,
      );
    });
  });

  // ==========================================================
  // create
  // ==========================================================

  describe('create', () => {
    it('crea un rol con permisos válidos', async () => {
      repo.findBySlug.mockResolvedValue(null);
      repo.create.mockResolvedValue(baseRole() as Awaited<ReturnType<RepoMock['create']>>);

      await service.create(TENANT_ID, ACTOR_USER_ID, {
        slug: 'contador',
        name: 'Contador',
        permissions: ['contabilidad.ventas.read'],
      });

      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: TENANT_ID,
          slug: 'contador',
          isEditable: true,
          isSystemDefault: false,
        }),
      );
    });

    it('acepta wildcards en permisos sin chequear catálogo', async () => {
      repo.findBySlug.mockResolvedValue(null);
      repo.create.mockResolvedValue(baseRole() as Awaited<ReturnType<RepoMock['create']>>);

      await service.create(TENANT_ID, ACTOR_USER_ID, {
        slug: 'contador',
        name: 'Contador',
        permissions: ['contabilidad.*'],
      });

      expect(repo.create).toHaveBeenCalled();
    });

    it('lanza CustomRoleSlugDuplicadoError si el slug ya existe', async () => {
      repo.findBySlug.mockResolvedValue(baseRole() as Awaited<ReturnType<RepoMock['findBySlug']>>);
      await expect(
        service.create(TENANT_ID, ACTOR_USER_ID, {
          slug: 'contador',
          name: 'Contador',
          permissions: ['contabilidad.ventas.read'],
        }),
      ).rejects.toBeInstanceOf(CustomRoleSlugDuplicadoError);
    });

    it('lanza PermisoDesconocidoError si un permiso exacto no está en el catálogo', async () => {
      await expect(
        service.create(TENANT_ID, ACTOR_USER_ID, {
          slug: 'contador',
          name: 'Contador',
          permissions: ['foo.bar.bazz'],
        }),
      ).rejects.toBeInstanceOf(PermisoDesconocidoError);
    });

    it('lanza PermisoInvalidoError si un permiso tiene sintaxis inválida', async () => {
      await expect(
        service.create(TENANT_ID, ACTOR_USER_ID, {
          slug: 'contador',
          name: 'Contador',
          permissions: ['*.read'],
        }),
      ).rejects.toBeInstanceOf(PermisoInvalidoError);
    });

    // ---- Candado de la deuda RBAC: vertical + packs (§7) ----

    it('acepta un permiso core del vertical activo', async () => {
      repo.findBySlug.mockResolvedValue(null);
      repo.create.mockResolvedValue(baseRole() as Awaited<ReturnType<RepoMock['create']>>);

      await service.create(TENANT_ID, ACTOR_USER_ID, {
        slug: 'contador',
        name: 'Contador',
        permissions: ['contabilidad.asientos.create'],
      });

      expect(repo.create).toHaveBeenCalled();
    });

    it('lanza PermisoNoHabilitadoError si el permiso es de otro vertical', async () => {
      await expect(
        service.create(TENANT_ID, ACTOR_USER_ID, {
          slug: 'granjero',
          name: 'Granjero',
          permissions: ['granja.lotes.read'],
        }),
      ).rejects.toBeInstanceOf(PermisoNoHabilitadoError);
      expect(repo.create).not.toHaveBeenCalled();
    });

    it('lanza PermisoNoHabilitadoError si el permiso es de un submódulo de pack NO activo', async () => {
      resolver.resolver.mockResolvedValue({
        vertical: 'CONTABILIDAD',
        packsCatalogo: ['contabilidad.ventas'],
        packsActivos: [],
      });
      await expect(
        service.create(TENANT_ID, ACTOR_USER_ID, {
          slug: 'vendedor',
          name: 'Vendedor',
          permissions: ['contabilidad.ventas.read'],
        }),
      ).rejects.toBeInstanceOf(PermisoNoHabilitadoError);
    });

    it('acepta un permiso de submódulo de pack cuando el pack está activo', async () => {
      resolver.resolver.mockResolvedValue({
        vertical: 'CONTABILIDAD',
        packsCatalogo: ['contabilidad.ventas'],
        packsActivos: ['contabilidad.ventas'],
      });
      repo.findBySlug.mockResolvedValue(null);
      repo.create.mockResolvedValue(baseRole() as Awaited<ReturnType<RepoMock['create']>>);

      await service.create(TENANT_ID, ACTOR_USER_ID, {
        slug: 'vendedor',
        name: 'Vendedor',
        permissions: ['contabilidad.ventas.read'],
      });

      expect(repo.create).toHaveBeenCalled();
    });

    it('acepta organizacion.* y sistema.* siempre (cross-vertical)', async () => {
      repo.findBySlug.mockResolvedValue(null);
      repo.create.mockResolvedValue(baseRole() as Awaited<ReturnType<RepoMock['create']>>);

      await service.create(TENANT_ID, ACTOR_USER_ID, {
        slug: 'admin-rol',
        name: 'Admin',
        permissions: ['organizacion.miembros.read', 'sistema.feature-flags.admin'],
      });

      expect(repo.create).toHaveBeenCalled();
    });

    it('rechaza wildcard de submódulo de pack no activo (contabilidad.ventas.*)', async () => {
      resolver.resolver.mockResolvedValue({
        vertical: 'CONTABILIDAD',
        packsCatalogo: ['contabilidad.ventas'],
        packsActivos: [],
      });
      await expect(
        service.create(TENANT_ID, ACTOR_USER_ID, {
          slug: 'vendedor',
          name: 'Vendedor',
          permissions: ['contabilidad.ventas.*'],
        }),
      ).rejects.toBeInstanceOf(PermisoNoHabilitadoError);
    });

    it('acepta wildcard amplio del vertical (contabilidad.*) — grant estilo OWNER', async () => {
      repo.findBySlug.mockResolvedValue(null);
      repo.create.mockResolvedValue(baseRole() as Awaited<ReturnType<RepoMock['create']>>);

      await service.create(TENANT_ID, ACTOR_USER_ID, {
        slug: 'jefe',
        name: 'Jefe',
        permissions: ['contabilidad.*'],
      });

      expect(repo.create).toHaveBeenCalled();
    });
  });

  // ==========================================================
  // clone
  // ==========================================================

  describe('clone', () => {
    it('clona un rol con un slug nuevo', async () => {
      repo.findById.mockResolvedValue(baseRole() as Awaited<ReturnType<RepoMock['findById']>>);
      repo.findBySlug.mockResolvedValue(null);
      repo.create.mockResolvedValue(baseRole() as Awaited<ReturnType<RepoMock['create']>>);

      await service.clone(TENANT_ID, ACTOR_USER_ID, ROLE_ID, {
        slug: 'contador-jr',
      });

      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          slug: 'contador-jr',
          name: 'Contador (copia)',
        }),
      );
    });

    it('lanza CustomRoleSlugDuplicadoError si el nuevo slug ya existe', async () => {
      repo.findById.mockResolvedValue(baseRole() as Awaited<ReturnType<RepoMock['findById']>>);
      repo.findBySlug.mockResolvedValue(baseRole() as Awaited<ReturnType<RepoMock['findBySlug']>>);

      await expect(
        service.clone(TENANT_ID, ACTOR_USER_ID, ROLE_ID, { slug: 'contador' }),
      ).rejects.toBeInstanceOf(CustomRoleSlugDuplicadoError);
    });

    it('lanza CustomRoleNoEncontradoError si el source no existe', async () => {
      repo.findById.mockResolvedValue(null);
      await expect(
        service.clone(TENANT_ID, ACTOR_USER_ID, ROLE_ID, { slug: 'x' }),
      ).rejects.toBeInstanceOf(CustomRoleNoEncontradoError);
    });
  });

  // ==========================================================
  // update
  // ==========================================================

  describe('update', () => {
    it('actualiza nombre y descripción sin invalidar cache RBAC', async () => {
      repo.findById.mockResolvedValue(baseRole() as Awaited<ReturnType<RepoMock['findById']>>);
      repo.update.mockResolvedValue(baseRole() as Awaited<ReturnType<RepoMock['update']>>);

      await service.update(TENANT_ID, ROLE_ID, { name: 'Nuevo Nombre' });

      expect(repo.update).toHaveBeenCalledWith(ROLE_ID, TENANT_ID, {
        name: 'Nuevo Nombre',
      });
      expect(rbac.invalidateUsersByCustomRole).not.toHaveBeenCalled();
    });

    it('invalida cache RBAC cuando cambian los permisos', async () => {
      repo.findById.mockResolvedValue(baseRole() as Awaited<ReturnType<RepoMock['findById']>>);
      repo.update.mockResolvedValue(baseRole() as Awaited<ReturnType<RepoMock['update']>>);

      await service.update(TENANT_ID, ROLE_ID, {
        permissions: ['contabilidad.compras.read'],
      });

      expect(rbac.invalidateUsersByCustomRole).toHaveBeenCalledWith(ROLE_ID);
    });

    it('lanza CustomRoleNoEditableError si el rol no es editable', async () => {
      repo.findById.mockResolvedValue({
        ...baseRole(),
        isEditable: false,
      } as Awaited<ReturnType<RepoMock['findById']>>);

      await expect(service.update(TENANT_ID, ROLE_ID, { name: 'X' })).rejects.toBeInstanceOf(
        CustomRoleNoEditableError,
      );
    });

    it('valida permisos antes de actualizar', async () => {
      repo.findById.mockResolvedValue(baseRole() as Awaited<ReturnType<RepoMock['findById']>>);

      await expect(
        service.update(TENANT_ID, ROLE_ID, {
          permissions: ['foo.bar.bazz'],
        }),
      ).rejects.toBeInstanceOf(PermisoDesconocidoError);
      expect(repo.update).not.toHaveBeenCalled();
    });
  });

  // ==========================================================
  // delete
  // ==========================================================

  describe('delete', () => {
    it('elimina un rol editable sin miembros activos', async () => {
      repo.findById.mockResolvedValue(baseRole() as Awaited<ReturnType<RepoMock['findById']>>);
      repo.countActiveMembers.mockResolvedValue(0);

      await service.delete(TENANT_ID, ROLE_ID);

      expect(rbac.invalidateUsersByCustomRole).toHaveBeenCalledWith(ROLE_ID);
      expect(repo.delete).toHaveBeenCalledWith(ROLE_ID, TENANT_ID);
    });

    it('lanza CustomRoleDelSistemaError si es rol del sistema', async () => {
      repo.findById.mockResolvedValue({
        ...baseRole(),
        isSystemDefault: true,
      } as Awaited<ReturnType<RepoMock['findById']>>);

      await expect(service.delete(TENANT_ID, ROLE_ID)).rejects.toBeInstanceOf(
        CustomRoleDelSistemaError,
      );
      expect(repo.delete).not.toHaveBeenCalled();
    });

    it('lanza CustomRoleConMiembrosActivosError si tiene miembros activos', async () => {
      repo.findById.mockResolvedValue(baseRole() as Awaited<ReturnType<RepoMock['findById']>>);
      repo.countActiveMembers.mockResolvedValue(3);

      await expect(service.delete(TENANT_ID, ROLE_ID)).rejects.toBeInstanceOf(
        CustomRoleConMiembrosActivosError,
      );
      expect(repo.delete).not.toHaveBeenCalled();
    });
  });
});
