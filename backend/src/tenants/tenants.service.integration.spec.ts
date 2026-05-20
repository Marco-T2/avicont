import { PrismaClient, SystemRole } from '@prisma/client';

import type { PrismaService } from '@/common/prisma.service';
import { PrismaPlanCuentasSeederAdapter } from '@/cuentas/adapters/prisma-plan-cuentas-seeder.adapter';
import { PLAN_CUENTAS_SEEDER_PORT, PlanCuentasSeederPort } from '@/cuentas/ports/plan-cuentas-seeder.port';

import { PrismaTenantRepository } from './adapters/prisma-tenant.repository';
import { ModuloOrganizacion } from './dto/create-tenant.dto';
import { TenantsService } from './tenants.service';
import { TENANT_REPOSITORY_PORT } from './ports/tenant.repository.port';

/**
 * Integration spec de `TenantsService.create` contra Postgres real.
 *
 * Instancia manualmente el servicio y los adapters reales sin NestJS DI
 * (patrón del proyecto: PrismaClient directo, no Test.createTestingModule).
 *
 * Valida las garantías que requieren la base de datos:
 *   - CONTABILIDAD: 111 cuentas + OrgConfiguracionContable + OWNER, flags correctos.
 *   - Rollback total: si el seeder lanza, la org NO queda en BD (E-ATOM-01).
 *   - GRANJA: granjaEnabled=true, contabilidadEnabled=false, cero cuentas.
 *   - OTROS: ambos flags false, cero cuentas.
 *   - Multi-tenant: cuentas aisladas por organizationId (E-MT-01/02).
 */
describe('TenantsService.create (integration)', () => {
  const EMAIL_OWNER = 'integration-tenants-service@test.com';
  const EMAIL_OWNER_B = 'integration-tenants-service-b@test.com';

  let prisma: PrismaClient;
  let service: TenantsService;
  let ownerId: string;
  let ownerBId: string;
  let createdSlugs: string[];

  function buildService(seeder: PlanCuentasSeederPort = new PrismaPlanCuentasSeederAdapter()) {
    const repo = new PrismaTenantRepository(prisma as unknown as PrismaService);

    // TenantsService depende de ports que necesitamos mockear para la integración.
    // Usamos un cast mínimo — este test solo ejerce `create`, no los otros métodos.
    const mockGestiones = { existeAlgunaGestion: jest.fn() };
    const mockMemberships = { findAllByTenant: jest.fn() };
    const mockRedis = { del: jest.fn().mockResolvedValue(0) };

    return new TenantsService(
      /* TENANT_REPOSITORY_PORT */ repo,
      /* MEMBERSHIPS_READER_PORT */ mockMemberships as never,
      /* GESTIONES_READER_PORT */ mockGestiones as never,
      /* RedisService */ mockRedis as never,
      /* PLAN_CUENTAS_SEEDER_PORT */ seeder,
      /* PrismaService */ prisma as unknown as PrismaService,
    );
  }

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();
    service = buildService();
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    createdSlugs = [];
    await cleanup();
    const owner = await prisma.user.create({
      data: { email: EMAIL_OWNER, hashedPassword: 'x', displayName: 'Owner Integration' },
    });
    ownerId = owner.id;
  });

  async function cleanup() {
    const slugsToClean = [
      ...(createdSlugs ?? []),
      'org-integration-cont-a',
      'org-integration-cont-b',
      'org-integration-granja',
      'org-integration-otros',
      'org-integration-rollback',
    ];
    const orgs = await prisma.organization.findMany({
      where: { slug: { in: slugsToClean } },
      select: { id: true },
    });
    const orgIds = orgs.map((o) => o.id);
    if (orgIds.length > 0) {
      await prisma.orgConfiguracionContable.deleteMany({ where: { organizationId: { in: orgIds } } });
      await prisma.cuenta.deleteMany({ where: { organizationId: { in: orgIds } } });
      await prisma.membership.deleteMany({ where: { organizationId: { in: orgIds } } });
      await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
    }
    await prisma.user.deleteMany({ where: { email: { in: [EMAIL_OWNER, EMAIL_OWNER_B] } } });
  }

  describe('alta CONTABILIDAD', () => {
    it('siembra exactamente 111 cuentas + OrgConfiguracionContable + membership OWNER y flags correctos (E-CONT-01 y E-CONT-02)', async () => {
      const result = await service.create(
        { name: 'Org Integration Cont A', modulo: ModuloOrganizacion.CONTABILIDAD },
        ownerId,
      );
      createdSlugs.push(result.slug);

      // Flags correctos (D1)
      expect(result.contabilidadEnabled).toBe(true);
      expect(result.granjaEnabled).toBe(false);

      // Membership OWNER presente
      expect(result.memberships).toHaveLength(1);
      expect(result.memberships[0]?.userId).toBe(ownerId);
      expect(result.memberships[0]?.systemRole).toBe(SystemRole.OWNER);

      // 111 cuentas sembradas
      const cuentaCount = await prisma.cuenta.count({ where: { organizationId: result.id } });
      expect(cuentaCount).toBe(111);

      // OrgConfiguracionContable poblada
      const config = await prisma.orgConfiguracionContable.findUnique({
        where: { organizationId: result.id },
      });
      expect(config).not.toBeNull();
      expect(config!.organizationId).toBe(result.id);

      // Los 8 conceptos requeridos deben estar mapeados (no nulos)
      const conceptos = [
        config!.ivaCreditoId,
        config!.ivaDebitoId,
        config!.rcIvaRetenidoId,
        config!.itPorPagarId,
        config!.resultadosAcumuladosId,
        config!.resultadoEjercicioId,
        config!.difCambioGananciaId,
        config!.difCambioPerdidaId,
      ];
      expect(conceptos.filter((v) => v !== null)).toHaveLength(8);
    });
  });

  describe('aislamiento multi-tenant (E-MT-01 / E-MT-02)', () => {
    it('dos organizaciones CONTABILIDAD tienen exactamente 111 cuentas cada una, aisladas por organizationId', async () => {
      const orgA = await service.create(
        { name: 'Org Integration Cont A', modulo: ModuloOrganizacion.CONTABILIDAD },
        ownerId,
      );
      createdSlugs.push(orgA.slug);

      const ownerB = await prisma.user.create({
        data: { email: EMAIL_OWNER_B, hashedPassword: 'x' },
      });
      ownerBId = ownerB.id;

      const orgB = await service.create(
        { name: 'Org Integration Cont B', modulo: ModuloOrganizacion.CONTABILIDAD },
        ownerBId,
      );
      createdSlugs.push(orgB.slug);

      const cuentasA = await prisma.cuenta.count({ where: { organizationId: orgA.id } });
      const cuentasB = await prisma.cuenta.count({ where: { organizationId: orgB.id } });
      expect(cuentasA).toBe(111);
      expect(cuentasB).toBe(111);

      // Ninguna cuenta de A tiene el organizationId de B
      const idsA = (await prisma.cuenta.findMany({ where: { organizationId: orgA.id }, select: { id: true } })).map((c) => c.id);
      const contaminacion = await prisma.cuenta.count({
        where: { id: { in: idsA }, organizationId: orgB.id },
      });
      expect(contaminacion).toBe(0);
    });
  });

  describe('alta GRANJA (E-GRAN-01)', () => {
    it('setea granjaEnabled=true, contabilidadEnabled=false y NO siembra cuentas', async () => {
      const result = await service.create(
        { name: 'Org Integration Granja', modulo: ModuloOrganizacion.GRANJA },
        ownerId,
      );
      createdSlugs.push(result.slug);

      expect(result.granjaEnabled).toBe(true);
      expect(result.contabilidadEnabled).toBe(false);

      const cuentaCount = await prisma.cuenta.count({ where: { organizationId: result.id } });
      expect(cuentaCount).toBe(0);
    });
  });

  describe('alta OTROS (E-OTROS-01)', () => {
    it('setea ambos flags en false y NO siembra cuentas', async () => {
      const result = await service.create(
        { name: 'Org Integration Otros', modulo: ModuloOrganizacion.OTROS },
        ownerId,
      );
      createdSlugs.push(result.slug);

      expect(result.contabilidadEnabled).toBe(false);
      expect(result.granjaEnabled).toBe(false);

      const cuentaCount = await prisma.cuenta.count({ where: { organizationId: result.id } });
      expect(cuentaCount).toBe(0);
    });
  });

  describe('rollback total (E-ATOM-01)', () => {
    it('si el seeder lanza, la org NO queda en BD y tampoco las memberships', async () => {
      const seederFallido: PlanCuentasSeederPort = {
        seedDefaultsForTenant: jest
          .fn()
          .mockRejectedValue(new Error('fallo deliberado del seeder')),
      } as unknown as PlanCuentasSeederPort;

      const serviceConFallo = buildService(seederFallido);

      await expect(
        serviceConFallo.create(
          { name: 'Org Integration Rollback', modulo: ModuloOrganizacion.CONTABILIDAD },
          ownerId,
        ),
      ).rejects.toThrow('fallo deliberado del seeder');

      // La org no debe existir en BD
      const orgEnBd = await prisma.organization.findUnique({
        where: { slug: 'org-integration-rollback' },
      });
      expect(orgEnBd).toBeNull();

      // Sin memberships huérfanas
      const membs = await prisma.membership.findMany({
        where: { userId: ownerId },
      });
      expect(membs).toHaveLength(0);

      // Sin cuentas huérfanas
      const orgsDelOwner = await prisma.membership.findMany({
        where: { userId: ownerId },
      });
      expect(orgsDelOwner).toHaveLength(0);
    });
  });
});
