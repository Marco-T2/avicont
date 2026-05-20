import { Test, TestingModule } from '@nestjs/testing';
import { Plan, OrganizationStatus, SystemRole, TipoEmpresa } from '@prisma/client';
import type { Organization } from '@prisma/client';

import { RedisService } from '@/cache/redis.service';
import {
  GESTIONES_READER_PORT,
  type GestionesReaderPort,
} from '@/periodos-fiscales/ports/gestiones-reader.port';
import {
  MEMBERSHIPS_READER_PORT,
  type MembershipsReaderPort,
} from '@/memberships/ports/memberships-reader.port';

import {
  TenantNoEncontradoError,
  TenantSlugDuplicadoError,
  TenantSlugInvalidoError,
  TipoEmpresaInmutableError,
} from './domain/tenant-errors';
import {
  TENANT_REPOSITORY_PORT,
  type OrganizationConMemberships,
  type TenantRepositoryPort,
} from './ports/tenant.repository.port';
import { TenantsService } from './tenants.service';

/**
 * Unit tests de TenantsService. Cubren el cableado entre el service y los
 * ports (TenantRepositoryPort + MembershipsReaderPort + GestionesReaderPort)
 * sin tocar Postgres. La integración full-stack vive en
 * `test/tenant-isolation.e2e-spec.ts` y los e2e de feature-flags y
 * periodos-fiscales.
 */
describe('TenantsService (unit)', () => {
  const TENANT_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
  const OWNER_ID = '11111111-2222-4333-8444-555555555555';

  type RepoMock = jest.Mocked<TenantRepositoryPort>;
  type MembershipsMock = jest.Mocked<MembershipsReaderPort>;
  type GestionesMock = jest.Mocked<GestionesReaderPort>;
  type RedisMock = { del: jest.Mock };

  let service: TenantsService;
  let repo: RepoMock;
  let memberships: MembershipsMock;
  let gestiones: GestionesMock;
  let redis: RedisMock;

  beforeEach(async () => {
    repo = {
      create: jest.fn(),
      findById: jest.fn(),
      findBySlug: jest.fn(),
      existsBySlug: jest.fn().mockResolvedValue(false),
      update: jest.fn(),
      findFeatures: jest.fn(),
      updateFeatures: jest.fn(),
    } as unknown as RepoMock;

    memberships = {
      findActivasByUserId: jest.fn(),
      findActivaByUserAndTenant: jest.fn(),
      findActivasConOrganizacionByUserId: jest.fn(),
      findForImpersonation: jest.fn(),
      findAllByTenant: jest.fn().mockResolvedValue([]),
    } as unknown as MembershipsMock;

    gestiones = {
      existeAlgunaGestion: jest.fn().mockResolvedValue(false),
    } as unknown as GestionesMock;

    redis = { del: jest.fn().mockResolvedValue(0) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TenantsService,
        { provide: TENANT_REPOSITORY_PORT, useValue: repo },
        { provide: MEMBERSHIPS_READER_PORT, useValue: memberships },
        { provide: GESTIONES_READER_PORT, useValue: gestiones },
        { provide: RedisService, useValue: redis },
      ],
    }).compile();

    service = module.get(TenantsService);
  });

  function mkOrg(overrides: Partial<Organization> = {}): Organization {
    return {
      id: TENANT_ID,
      slug: 'acme-corp',
      name: 'Acme Corp',
      status: OrganizationStatus.ACTIVE,
      plan: Plan.FREE,
      contabilidadEnabled: true,
      granjaEnabled: false,
      tipoEmpresaPrincipal: TipoEmpresa.COMERCIAL,
      tiposEmpresaActivos: [TipoEmpresa.COMERCIAL],
      createdAt: new Date('2026-01-01T00:00:00Z'),
      updatedAt: new Date('2026-01-01T00:00:00Z'),
      ...overrides,
    } as Organization;
  }

  describe('create', () => {
    it('genera slug desde el name y crea organización + membership OWNER', async () => {
      const created: OrganizationConMemberships = {
        ...mkOrg({ name: 'Acme Corp', slug: 'acme-corp' }),
        memberships: [
          {
            id: 'mb1',
            organizationId: TENANT_ID,
            userId: OWNER_ID,
            systemRole: SystemRole.OWNER,
          } as never,
        ],
      };
      repo.create.mockResolvedValue(created);

      const result = await service.create({ name: 'Acme Corp' }, OWNER_ID);

      expect(repo.existsBySlug).toHaveBeenCalledWith('acme-corp');
      expect(repo.create).toHaveBeenCalledWith({
        slug: 'acme-corp',
        name: 'Acme Corp',
        ownerUserId: OWNER_ID,
      });
      expect(result.memberships[0]?.systemRole).toBe(SystemRole.OWNER);
    });

    it('lanza TenantSlugDuplicadoError (409) si el slug ya existe', async () => {
      repo.existsBySlug.mockResolvedValue(true);

      await expect(service.create({ name: 'Acme Corp' }, OWNER_ID)).rejects.toBeInstanceOf(
        TenantSlugDuplicadoError,
      );
      expect(repo.create).not.toHaveBeenCalled();
    });

    it('lanza TenantSlugInvalidoError (400) si el name no produce caracteres alfanuméricos', async () => {
      await expect(service.create({ name: '!!!' }, OWNER_ID)).rejects.toBeInstanceOf(
        TenantSlugInvalidoError,
      );
      expect(repo.existsBySlug).not.toHaveBeenCalled();
    });

    it('preserva diacríticos al slugificar (NFKD)', async () => {
      repo.create.mockResolvedValue({
        ...mkOrg({ name: 'José Martínez', slug: 'jose-martinez' }),
        memberships: [],
      });

      await service.create({ name: 'José Martínez' }, OWNER_ID);

      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({ slug: 'jose-martinez', name: 'José Martínez' }),
      );
    });
  });

  describe('findById', () => {
    it('retorna la organización si existe', async () => {
      const org = mkOrg();
      repo.findById.mockResolvedValue(org);

      expect(await service.findById(TENANT_ID)).toBe(org);
    });

    it('lanza TenantNoEncontradoError (404) si no existe', async () => {
      repo.findById.mockResolvedValue(null);

      await expect(service.findById(TENANT_ID)).rejects.toBeInstanceOf(TenantNoEncontradoError);
    });
  });

  describe('findBySlug', () => {
    it('retorna la organización si existe', async () => {
      const org = mkOrg();
      repo.findBySlug.mockResolvedValue(org);

      expect(await service.findBySlug('acme-corp')).toBe(org);
    });

    it('lanza TenantNoEncontradoError (404) si no existe', async () => {
      repo.findBySlug.mockResolvedValue(null);

      await expect(service.findBySlug('inexistente')).rejects.toBeInstanceOf(
        TenantNoEncontradoError,
      );
    });
  });

  describe('update', () => {
    it('aplica el patch directo si no toca tipoEmpresaPrincipal', async () => {
      const updated = mkOrg({ name: 'Renombrado' });
      repo.update.mockResolvedValue(updated);

      const result = await service.update(TENANT_ID, { name: 'Renombrado' });

      expect(gestiones.existeAlgunaGestion).not.toHaveBeenCalled();
      expect(repo.update).toHaveBeenCalledWith(TENANT_ID, { name: 'Renombrado' });
      expect(result).toBe(updated);
    });

    it('valida con gestionesReader cuando viene tipoEmpresaPrincipal y permite el cambio si no hay gestión', async () => {
      gestiones.existeAlgunaGestion.mockResolvedValue(false);
      const updated = mkOrg({ tipoEmpresaPrincipal: TipoEmpresa.SERVICIOS });
      repo.update.mockResolvedValue(updated);

      await service.update(TENANT_ID, { tipoEmpresaPrincipal: TipoEmpresa.SERVICIOS });

      expect(gestiones.existeAlgunaGestion).toHaveBeenCalledWith(TENANT_ID);
      expect(repo.update).toHaveBeenCalled();
    });

    it('lanza TipoEmpresaInmutableError (409) si ya existe alguna gestión', async () => {
      gestiones.existeAlgunaGestion.mockResolvedValue(true);

      await expect(
        service.update(TENANT_ID, { tipoEmpresaPrincipal: TipoEmpresa.SERVICIOS }),
      ).rejects.toBeInstanceOf(TipoEmpresaInmutableError);

      expect(repo.update).not.toHaveBeenCalled();
    });
  });

  describe('getMembers', () => {
    it('delega a memberships.findAllByTenant', async () => {
      const rows = [
        {
          id: 'm1',
          userId: 'u1',
          systemRole: SystemRole.OWNER,
          customRoleId: null,
          customRole: null,
          deactivatedAt: null,
          createdAt: new Date(),
          user: { id: 'u1', email: 'a@b.com', displayName: null },
        },
      ];
      memberships.findAllByTenant.mockResolvedValue(rows);

      const result = await service.getMembers(TENANT_ID);

      expect(memberships.findAllByTenant).toHaveBeenCalledWith(TENANT_ID);
      expect(result).toBe(rows);
    });
  });

  describe('getFeatures', () => {
    it('retorna sólo los flags', async () => {
      repo.findFeatures.mockResolvedValue({
        contabilidadEnabled: true,
        granjaEnabled: false,
      });

      expect(await service.getFeatures(TENANT_ID)).toEqual({
        contabilidadEnabled: true,
        granjaEnabled: false,
      });
    });

    it('lanza TenantNoEncontradoError si no existe', async () => {
      repo.findFeatures.mockResolvedValue(null);

      await expect(service.getFeatures(TENANT_ID)).rejects.toBeInstanceOf(TenantNoEncontradoError);
    });
  });

  describe('updateFeatures', () => {
    it('aplica el patch e invalida la cache RBAC del tenant', async () => {
      repo.updateFeatures.mockResolvedValue({
        contabilidadEnabled: true,
        granjaEnabled: true,
      });

      const result = await service.updateFeatures(TENANT_ID, { granjaEnabled: true });

      expect(repo.updateFeatures).toHaveBeenCalledWith(TENANT_ID, { granjaEnabled: true });
      expect(redis.del).toHaveBeenCalledWith(`org-features:${TENANT_ID}`);
      expect(result).toEqual({ contabilidadEnabled: true, granjaEnabled: true });
    });

    it('no rompe el flujo si la invalidación de cache falla', async () => {
      repo.updateFeatures.mockResolvedValue({
        contabilidadEnabled: false,
        granjaEnabled: false,
      });
      redis.del.mockRejectedValue(new Error('redis down'));

      const result = await service.updateFeatures(TENANT_ID, {
        contabilidadEnabled: false,
      });

      expect(result.contabilidadEnabled).toBe(false);
    });
  });
});
