import { PrismaClient } from '@prisma/client';

import type { PrismaService } from '@/common/prisma.service';

import { PrismaCustomRolesReaderAdapter } from './prisma-custom-roles-reader.adapter';

/**
 * Integration spec de `PrismaCustomRolesReaderAdapter` contra Postgres
 * real. Valida la única operación del port cross-módulo
 * (`belongsToTenant`) en los 3 casos negativos + 1 positivo. La
 * semántica de "no filtrar IDs cross-tenant" exige que los 3 casos
 * negativos retornen el mismo `false` sin discriminar.
 */
describe('PrismaCustomRolesReaderAdapter (integration)', () => {
  const SLUG_A = 'org-test-cr-reader-a';
  const SLUG_B = 'org-test-cr-reader-b';

  let prisma: PrismaClient;
  let adapter: PrismaCustomRolesReaderAdapter;
  let tenantA: string;
  let tenantB: string;
  let roleAId: string;

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();
    adapter = new PrismaCustomRolesReaderAdapter(prisma as unknown as PrismaService);
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await cleanup();
    const [a, b] = await Promise.all([
      prisma.organization.create({ data: { slug: SLUG_A, name: 'Org A' } }),
      prisma.organization.create({ data: { slug: SLUG_B, name: 'Org B' } }),
    ]);
    tenantA = a.id;
    tenantB = b.id;

    const role = await prisma.customRole.create({
      data: {
        organizationId: tenantA,
        slug: 'contador',
        name: 'Contador',
        permissions: ['contabilidad.read'],
      },
    });
    roleAId = role.id;
  });

  async function cleanup() {
    const orgs = await prisma.organization.findMany({
      where: { slug: { in: [SLUG_A, SLUG_B] } },
      select: { id: true },
    });
    if (orgs.length > 0) {
      await prisma.organization.deleteMany({
        where: { id: { in: orgs.map((o) => o.id) } },
      });
    }
  }

  it('retorna true si el customRole existe en el tenant', async () => {
    await expect(adapter.belongsToTenant(roleAId, tenantA)).resolves.toBe(true);
  });

  it('retorna false si el customRole existe en OTRO tenant', async () => {
    await expect(adapter.belongsToTenant(roleAId, tenantB)).resolves.toBe(false);
  });

  it('retorna false si el customRoleId no existe', async () => {
    await expect(
      adapter.belongsToTenant('00000000-0000-4000-8000-000000000000', tenantA),
    ).resolves.toBe(false);
  });

  it('retorna false si el customRoleId no es un UUID válido', async () => {
    await expect(adapter.belongsToTenant('not-a-uuid', tenantA)).resolves.toBe(false);
  });
});

describe('listarAsignablesPorOrg', () => {
  const SLUG_X = 'org-listar-asig-x';
  const SLUG_Y = 'org-listar-asig-y';

  let prisma: PrismaClient;
  let adapter: PrismaCustomRolesReaderAdapter;
  let orgX: string;
  let orgY: string;

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();
    adapter = new PrismaCustomRolesReaderAdapter(prisma as unknown as PrismaService);
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await cleanup();
    const [x, y] = await Promise.all([
      prisma.organization.create({ data: { slug: SLUG_X, name: 'Org X' } }),
      prisma.organization.create({ data: { slug: SLUG_Y, name: 'Org Y' } }),
    ]);
    orgX = x.id;
    orgY = y.id;
  });

  async function cleanup() {
    const orgs = await prisma.organization.findMany({
      where: { slug: { in: [SLUG_X, SLUG_Y] } },
      select: { id: true },
    });
    if (orgs.length > 0) {
      await prisma.organization.deleteMany({
        where: { id: { in: orgs.map((o) => o.id) } },
      });
    }
  }

  it('devuelve solo los custom roles de la org consultada — no los de otra org', async () => {
    await prisma.customRole.create({
      data: { organizationId: orgX, slug: 'contador-x', name: 'Contador X', permissions: [] },
    });
    await prisma.customRole.create({
      data: { organizationId: orgY, slug: 'contador-y', name: 'Contador Y', permissions: [] },
    });

    const result = await adapter.listarAsignablesPorOrg(orgX);

    expect(result).toHaveLength(1);
    expect(result[0]?.name).toBe('Contador X');
    expect(result.find((r) => r.name === 'Contador Y')).toBeUndefined();
  });

  it('devuelve array vacío si la org no tiene custom roles', async () => {
    const result = await adapter.listarAsignablesPorOrg(orgX);
    expect(result).toHaveLength(0);
  });

  it('ordena los custom roles por nombre ASC', async () => {
    await prisma.customRole.create({
      data: { organizationId: orgX, slug: 'zapador', name: 'Zapador', permissions: [] },
    });
    await prisma.customRole.create({
      data: { organizationId: orgX, slug: 'auditor', name: 'Auditor', permissions: [] },
    });
    await prisma.customRole.create({
      data: { organizationId: orgX, slug: 'contador', name: 'Contador', permissions: [] },
    });

    const result = await adapter.listarAsignablesPorOrg(orgX);

    expect(result).toHaveLength(3);
    expect(result[0]?.name).toBe('Auditor');
    expect(result[1]?.name).toBe('Contador');
    expect(result[2]?.name).toBe('Zapador');
  });

  it('devuelve id, name y slug en cada item', async () => {
    await prisma.customRole.create({
      data: { organizationId: orgX, slug: 'mi-rol', name: 'Mi Rol', permissions: [] },
    });

    const result = await adapter.listarAsignablesPorOrg(orgX);

    expect(result).toHaveLength(1);
    const item = result[0];
    expect(item).toHaveProperty('id');
    expect(item).toHaveProperty('name', 'Mi Rol');
    expect(item).toHaveProperty('slug', 'mi-rol');
  });
});
