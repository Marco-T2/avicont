import { Test, TestingModule } from '@nestjs/testing';
import {
  Plan,
  OrganizationStatus,
  SystemRole,
  TipoEmpresa as PrismaTipoEmpresa,
} from '@prisma/client';
import type { Organization, Prisma } from '@prisma/client';

import { RedisService } from '@/cache/redis.service';
import { TipoEmpresa } from '@/common/domain/enums';
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
  VerticalNoExclusivoError,
} from './domain/tenant-errors';
import {
  TENANT_REPOSITORY_PORT,
  type OrganizationConMemberships,
  type TenantRepositoryPort,
} from './ports/tenant.repository.port';
import { TenantsService } from './tenants.service';
import { ModuloOrganizacion } from './dto/create-tenant.dto';
import {
  PLAN_CUENTAS_SEEDER_PORT,
  type PlanCuentasSeederPort,
} from '@/cuentas/ports/plan-cuentas-seeder.port';
import {
  TIPO_DOCUMENTO_FISICO_SEEDER_PORT,
  type TipoDocumentoFisicoSeederPort,
} from '@/tipos-documento-fisico/ports/tipos-documento-fisico-seeder.port';
import { PrismaService } from '@/common/prisma.service';

/**
 * Unit tests de TenantsService. Cubren:
 *   - El mapeo modulo→flags (contabilidadEnabled/granjaEnabled).
 *   - Que CONTABILIDAD invoca PlanCuentasSeederPort.seedDefaultsForTenant.
 *   - Que GRANJA/OTROS no invocan ningún seeder.
 *   - Que todo ocurre dentro de prisma.$transaction.
 *   - Rollback semántico: si el seeder lanza, el error se propaga.
 *   - Casos previos: slug duplicado, slug inválido, findById, etc.
 */
describe('TenantsService (unit)', () => {
  const TENANT_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
  const OWNER_ID = '11111111-2222-4333-8444-555555555555';

  // Tx falso que simula el Prisma.TransactionClient que recibe el callback
  const TX_MOCK = { __isTxMock: true } as unknown as Prisma.TransactionClient;

  type RepoMock = jest.Mocked<TenantRepositoryPort>;
  type MembershipsMock = jest.Mocked<MembershipsReaderPort>;
  type GestionesMock = jest.Mocked<GestionesReaderPort>;
  type RedisMock = { del: jest.Mock };
  type PrismaMock = { $transaction: jest.Mock };
  type PlanCuentasSeederMock = jest.Mocked<PlanCuentasSeederPort>;
  type TiposDocSeederMock = jest.Mocked<TipoDocumentoFisicoSeederPort>;

  let service: TenantsService;
  let repo: RepoMock;
  let memberships: MembershipsMock;
  let gestiones: GestionesMock;
  let redis: RedisMock;
  let prismaMock: PrismaMock;
  let planCuentasSeeder: PlanCuentasSeederMock;
  let tiposDocSeeder: TiposDocSeederMock;

  function mkOrg(overrides: Partial<Organization> = {}): Organization {
    return {
      id: TENANT_ID,
      slug: 'acme-corp',
      name: 'Acme Corp',
      status: OrganizationStatus.ACTIVE,
      plan: Plan.FREE,
      contabilidadEnabled: true,
      granjaEnabled: false,
      tipoEmpresaPrincipal: PrismaTipoEmpresa.COMERCIAL,
      tiposEmpresaActivos: [PrismaTipoEmpresa.COMERCIAL],
      createdAt: new Date('2026-01-01T00:00:00Z'),
      updatedAt: new Date('2026-01-01T00:00:00Z'),
      ...overrides,
    } as Organization;
  }

  function mkOrgConMemberships(overrides: Partial<Organization> = {}): OrganizationConMemberships {
    return {
      ...mkOrg(overrides),
      memberships: [
        {
          id: 'mb1',
          organizationId: TENANT_ID,
          userId: OWNER_ID,
          systemRole: SystemRole.OWNER,
        } as never,
      ],
    };
  }

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

    planCuentasSeeder = {
      seedDefaultsForTenant: jest.fn().mockResolvedValue(undefined),
    } as unknown as PlanCuentasSeederMock;

    tiposDocSeeder = {
      seedDefaultsForTenant: jest.fn().mockResolvedValue(undefined),
    } as unknown as TiposDocSeederMock;

    // $transaction ejecuta el callback con TX_MOCK y retorna lo que devuelve el callback
    prismaMock = {
      $transaction: jest
        .fn()
        .mockImplementation(async (cb: (tx: Prisma.TransactionClient) => Promise<unknown>) =>
          cb(TX_MOCK),
        ),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TenantsService,
        { provide: TENANT_REPOSITORY_PORT, useValue: repo },
        { provide: MEMBERSHIPS_READER_PORT, useValue: memberships },
        { provide: GESTIONES_READER_PORT, useValue: gestiones },
        { provide: RedisService, useValue: redis },
        { provide: PLAN_CUENTAS_SEEDER_PORT, useValue: planCuentasSeeder },
        { provide: TIPO_DOCUMENTO_FISICO_SEEDER_PORT, useValue: tiposDocSeeder },
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    service = module.get(TenantsService);
  });

  describe('create — mapeo modulo → flags y seeders', () => {
    it('CONTABILIDAD: repo.create recibe contabilidadEnabled=true, granjaEnabled=false', async () => {
      const created = mkOrgConMemberships({ contabilidadEnabled: true, granjaEnabled: false });
      repo.create.mockResolvedValue(created);

      await service.create(
        { name: 'Acme Corp', modulo: ModuloOrganizacion.CONTABILIDAD },
        OWNER_ID,
      );

      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({ contabilidadEnabled: true, granjaEnabled: false }),
        TX_MOCK,
      );
    });

    it('CONTABILIDAD: invoca planCuentasSeeder.seedDefaultsForTenant con org.id y tx', async () => {
      const created = mkOrgConMemberships({
        id: TENANT_ID,
        contabilidadEnabled: true,
        granjaEnabled: false,
      });
      repo.create.mockResolvedValue(created);

      await service.create(
        { name: 'Acme Corp', modulo: ModuloOrganizacion.CONTABILIDAD },
        OWNER_ID,
      );

      expect(planCuentasSeeder.seedDefaultsForTenant).toHaveBeenCalledTimes(1);
      expect(planCuentasSeeder.seedDefaultsForTenant).toHaveBeenCalledWith(TENANT_ID, TX_MOCK);
    });

    it('CONTABILIDAD golden path: retorna OrganizationConMemberships', async () => {
      const created = mkOrgConMemberships({ contabilidadEnabled: true, granjaEnabled: false });
      repo.create.mockResolvedValue(created);

      const result = await service.create(
        { name: 'Acme Corp', modulo: ModuloOrganizacion.CONTABILIDAD },
        OWNER_ID,
      );

      expect(result.memberships[0]?.systemRole).toBe(SystemRole.OWNER);
    });

    it('CONTABILIDAD: invoca tiposDocSeeder.seedDefaultsForTenant con org.id y el mismo tx', async () => {
      const created = mkOrgConMemberships({
        id: TENANT_ID,
        contabilidadEnabled: true,
        granjaEnabled: false,
      });
      repo.create.mockResolvedValue(created);

      await service.create(
        { name: 'Acme Corp', modulo: ModuloOrganizacion.CONTABILIDAD },
        OWNER_ID,
      );

      expect(tiposDocSeeder.seedDefaultsForTenant).toHaveBeenCalledTimes(1);
      // El seed corre DENTRO de la misma TX que crea la org: mismo TX_MOCK.
      expect(tiposDocSeeder.seedDefaultsForTenant).toHaveBeenCalledWith(TENANT_ID, TX_MOCK);
    });

    it('CONTABILIDAD: si tiposDocSeeder lanza, el error se propaga (rollback semántico)', async () => {
      const created = mkOrgConMemberships({ contabilidadEnabled: true, granjaEnabled: false });
      repo.create.mockResolvedValue(created);
      tiposDocSeeder.seedDefaultsForTenant.mockRejectedValue(
        new Error('fallo al sembrar tipos de documento físico'),
      );

      await expect(
        service.create({ name: 'Acme Corp', modulo: ModuloOrganizacion.CONTABILIDAD }, OWNER_ID),
      ).rejects.toThrow('fallo al sembrar tipos de documento físico');
    });

    it('GRANJA: NO invoca tiposDocSeeder (los tipos son del módulo contabilidad)', async () => {
      const created = mkOrgConMemberships({ contabilidadEnabled: false, granjaEnabled: true });
      repo.create.mockResolvedValue(created);

      await service.create({ name: 'Granja Feliz', modulo: ModuloOrganizacion.GRANJA }, OWNER_ID);

      expect(tiposDocSeeder.seedDefaultsForTenant).not.toHaveBeenCalled();
    });

    it('OTROS: NO invoca tiposDocSeeder', async () => {
      const created = mkOrgConMemberships({ contabilidadEnabled: false, granjaEnabled: false });
      repo.create.mockResolvedValue(created);

      await service.create({ name: 'Otros SA', modulo: ModuloOrganizacion.OTROS }, OWNER_ID);

      expect(tiposDocSeeder.seedDefaultsForTenant).not.toHaveBeenCalled();
    });

    it('GRANJA: repo.create recibe contabilidadEnabled=false, granjaEnabled=true', async () => {
      const created = mkOrgConMemberships({ contabilidadEnabled: false, granjaEnabled: true });
      repo.create.mockResolvedValue(created);

      await service.create({ name: 'Granja Feliz', modulo: ModuloOrganizacion.GRANJA }, OWNER_ID);

      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({ contabilidadEnabled: false, granjaEnabled: true }),
        TX_MOCK,
      );
    });

    it('GRANJA: NO invoca planCuentasSeeder', async () => {
      const created = mkOrgConMemberships({ contabilidadEnabled: false, granjaEnabled: true });
      repo.create.mockResolvedValue(created);

      await service.create({ name: 'Granja Feliz', modulo: ModuloOrganizacion.GRANJA }, OWNER_ID);

      expect(planCuentasSeeder.seedDefaultsForTenant).not.toHaveBeenCalled();
    });

    it('OTROS: repo.create recibe ambos flags en false', async () => {
      const created = mkOrgConMemberships({ contabilidadEnabled: false, granjaEnabled: false });
      repo.create.mockResolvedValue(created);

      await service.create({ name: 'Otros SA', modulo: ModuloOrganizacion.OTROS }, OWNER_ID);

      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({ contabilidadEnabled: false, granjaEnabled: false }),
        TX_MOCK,
      );
    });

    it('OTROS: NO invoca ningún seeder', async () => {
      const created = mkOrgConMemberships({ contabilidadEnabled: false, granjaEnabled: false });
      repo.create.mockResolvedValue(created);

      await service.create({ name: 'Otros SA', modulo: ModuloOrganizacion.OTROS }, OWNER_ID);

      expect(planCuentasSeeder.seedDefaultsForTenant).not.toHaveBeenCalled();
    });

    it('todo ocurre dentro de prisma.$transaction', async () => {
      const created = mkOrgConMemberships();
      repo.create.mockResolvedValue(created);

      await service.create(
        { name: 'Acme Corp', modulo: ModuloOrganizacion.CONTABILIDAD },
        OWNER_ID,
      );

      expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    });

    it('seeder lanza → el error se propaga (rollback semántico)', async () => {
      const seederError = new Error('fallo de plantilla COMERCIAL');
      planCuentasSeeder.seedDefaultsForTenant.mockRejectedValue(seederError);

      // También hacer que $transaction propague el error del callback
      prismaMock.$transaction.mockImplementation(
        async (cb: (tx: Prisma.TransactionClient) => Promise<unknown>) => {
          // Simula que la TX propaga el error del seeder
          const created = mkOrgConMemberships({ contabilidadEnabled: true, granjaEnabled: false });
          repo.create.mockResolvedValue(created);
          return cb(TX_MOCK);
        },
      );

      await expect(
        service.create({ name: 'Acme Corp', modulo: ModuloOrganizacion.CONTABILIDAD }, OWNER_ID),
      ).rejects.toThrow('fallo de plantilla COMERCIAL');
    });
  });

  describe('create — validaciones previas a la TX', () => {
    it('genera slug desde el name y verifica existencia pre-TX', async () => {
      const created = mkOrgConMemberships({ name: 'Acme Corp', slug: 'acme-corp' });
      repo.create.mockResolvedValue(created);

      await service.create(
        { name: 'Acme Corp', modulo: ModuloOrganizacion.CONTABILIDAD },
        OWNER_ID,
      );

      expect(repo.existsBySlug).toHaveBeenCalledWith('acme-corp');
    });

    it('lanza TenantSlugDuplicadoError (409) si el slug ya existe — sin abrir TX', async () => {
      repo.existsBySlug.mockResolvedValue(true);

      await expect(
        service.create({ name: 'Acme Corp', modulo: ModuloOrganizacion.CONTABILIDAD }, OWNER_ID),
      ).rejects.toBeInstanceOf(TenantSlugDuplicadoError);

      expect(prismaMock.$transaction).not.toHaveBeenCalled();
      expect(repo.create).not.toHaveBeenCalled();
    });

    it('lanza TenantSlugInvalidoError (400) si el name no produce caracteres alfanuméricos', async () => {
      await expect(
        service.create({ name: '!!!', modulo: ModuloOrganizacion.CONTABILIDAD }, OWNER_ID),
      ).rejects.toBeInstanceOf(TenantSlugInvalidoError);

      expect(repo.existsBySlug).not.toHaveBeenCalled();
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });

    it('preserva diacríticos al slugificar (NFKD)', async () => {
      const created = mkOrgConMemberships({ name: 'José Martínez', slug: 'jose-martinez' });
      repo.create.mockResolvedValue(created);

      await service.create(
        { name: 'José Martínez', modulo: ModuloOrganizacion.CONTABILIDAD },
        OWNER_ID,
      );

      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({ slug: 'jose-martinez', name: 'José Martínez' }),
        TX_MOCK,
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
      const updated = mkOrg({ tipoEmpresaPrincipal: PrismaTipoEmpresa.SERVICIOS });
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
      // Org sin vertical (caso OTROS) prende granja: switch válido, no viola exclusividad.
      repo.findFeatures.mockResolvedValue({ contabilidadEnabled: false, granjaEnabled: false });
      repo.updateFeatures.mockResolvedValue({
        contabilidadEnabled: false,
        granjaEnabled: true,
      });

      const result = await service.updateFeatures(TENANT_ID, { granjaEnabled: true });

      expect(repo.updateFeatures).toHaveBeenCalledWith(TENANT_ID, { granjaEnabled: true });
      expect(redis.del).toHaveBeenCalledWith(`org-features:${TENANT_ID}`);
      expect(result).toEqual({ contabilidadEnabled: false, granjaEnabled: true });
    });

    it('no rompe el flujo si la invalidación de cache falla', async () => {
      repo.findFeatures.mockResolvedValue({ contabilidadEnabled: true, granjaEnabled: false });
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

    // §10.4 (plataforma-multi-vertical): vertical exclusivo por org.
    it('rechaza prender granja cuando contabilidad ya está activa (vertical exclusivo)', async () => {
      repo.findFeatures.mockResolvedValue({ contabilidadEnabled: true, granjaEnabled: false });

      await expect(
        service.updateFeatures(TENANT_ID, { granjaEnabled: true }),
      ).rejects.toBeInstanceOf(VerticalNoExclusivoError);

      expect(repo.updateFeatures).not.toHaveBeenCalled();
      expect(redis.del).not.toHaveBeenCalled();
    });

    it('rechaza prender ambos verticales en un mismo patch', async () => {
      repo.findFeatures.mockResolvedValue({ contabilidadEnabled: false, granjaEnabled: false });

      await expect(
        service.updateFeatures(TENANT_ID, { contabilidadEnabled: true, granjaEnabled: true }),
      ).rejects.toBeInstanceOf(VerticalNoExclusivoError);

      expect(repo.updateFeatures).not.toHaveBeenCalled();
    });

    it('permite switchear de vertical en un solo patch (contab → granja)', async () => {
      repo.findFeatures.mockResolvedValue({ contabilidadEnabled: true, granjaEnabled: false });
      repo.updateFeatures.mockResolvedValue({ contabilidadEnabled: false, granjaEnabled: true });

      const result = await service.updateFeatures(TENANT_ID, {
        contabilidadEnabled: false,
        granjaEnabled: true,
      });

      expect(result).toEqual({ contabilidadEnabled: false, granjaEnabled: true });
      expect(repo.updateFeatures).toHaveBeenCalled();
    });

    it('permite apagar el vertical activo (org queda sin vertical, caso OTROS)', async () => {
      repo.findFeatures.mockResolvedValue({ contabilidadEnabled: true, granjaEnabled: false });
      repo.updateFeatures.mockResolvedValue({ contabilidadEnabled: false, granjaEnabled: false });

      const result = await service.updateFeatures(TENANT_ID, { contabilidadEnabled: false });

      expect(result).toEqual({ contabilidadEnabled: false, granjaEnabled: false });
    });

    it('lanza TenantNoEncontradoError si el tenant no existe', async () => {
      repo.findFeatures.mockResolvedValue(null);

      await expect(
        service.updateFeatures(TENANT_ID, { granjaEnabled: true }),
      ).rejects.toBeInstanceOf(TenantNoEncontradoError);

      expect(repo.updateFeatures).not.toHaveBeenCalled();
    });
  });
});
