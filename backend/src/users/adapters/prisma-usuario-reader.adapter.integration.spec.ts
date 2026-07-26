import { PrismaClient, SystemRole } from '@prisma/client';

import type { PrismaService } from '@/common/prisma.service';

import { PrismaUsuarioReaderAdapter } from './prisma-usuario-reader.adapter';

/**
 * Integration spec de `PrismaUsuarioReaderAdapter` contra Postgres real.
 *
 * Lo que se está protegiendo acá es una propiedad de SEGURIDAD, no una
 * comodidad: `User` es global (no tiene `organizationId`), así que el único
 * predicado que impide resolver el nombre y el email de alguien de OTRA
 * organización es el filtro por membresía. Si ese filtro se cae, el port
 * convierte cualquier `*PorUserId` en un oráculo de identidades cross-tenant
 * (§4.2 core / Anti-31).
 *
 * Correr con:
 *   DATABASE_URL=... pnpm exec jest src/users/adapters/prisma-usuario-reader
 */
describe('PrismaUsuarioReaderAdapter (integration vs Postgres)', () => {
  const SLUG_A = 'org-test-usuario-reader-a';
  const SLUG_B = 'org-test-usuario-reader-b';

  let prisma: PrismaClient;
  let adapter: PrismaUsuarioReaderAdapter;
  let tenantA: string;
  let tenantB: string;
  let userConNombre: string;
  let userSinNombre: string;
  let userDeB: string;

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();
    adapter = new PrismaUsuarioReaderAdapter(prisma as unknown as PrismaService);
    await cleanup();

    const orgA = await prisma.organization.create({
      data: { slug: SLUG_A, name: 'Org A' },
    });
    const orgB = await prisma.organization.create({
      data: { slug: SLUG_B, name: 'Org B' },
    });
    tenantA = orgA.id;
    tenantB = orgB.id;

    const conNombre = await prisma.user.create({
      data: {
        email: `con-nombre@${SLUG_A}.bo`,
        hashedPassword: 'x',
        displayName: 'Marco Tarqui',
        memberships: { create: { organizationId: tenantA, systemRole: SystemRole.OWNER } },
      },
    });
    const sinNombre = await prisma.user.create({
      data: {
        email: `sin-nombre@${SLUG_A}.bo`,
        hashedPassword: 'x',
        memberships: { create: { organizationId: tenantA, systemRole: SystemRole.ADMIN } },
      },
    });
    const deB = await prisma.user.create({
      data: {
        email: `ajeno@${SLUG_B}.bo`,
        hashedPassword: 'x',
        displayName: 'Persona Ajena',
        memberships: { create: { organizationId: tenantB, systemRole: SystemRole.OWNER } },
      },
    });
    userConNombre = conNombre.id;
    userSinNombre = sinNombre.id;
    userDeB = deB.id;
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  async function cleanup(): Promise<void> {
    const orgs = await prisma.organization.findMany({
      where: { slug: { in: [SLUG_A, SLUG_B] } },
      select: { id: true },
    });
    const orgIds = orgs.map((o) => o.id);
    if (orgIds.length > 0) {
      await prisma.membership.deleteMany({ where: { organizationId: { in: orgIds } } });
      await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
    }
    await prisma.user.deleteMany({
      where: { email: { endsWith: `@${SLUG_A}.bo` } },
    });
    await prisma.user.deleteMany({
      where: { email: { endsWith: `@${SLUG_B}.bo` } },
    });
  }

  it('resuelve los usuarios del tenant con su displayName', async () => {
    const filas = await adapter.listarPorIds(tenantA, [userConNombre]);

    expect(filas).toEqual([
      { id: userConNombre, displayName: 'Marco Tarqui', email: `con-nombre@${SLUG_A}.bo` },
    ]);
  });

  it('devuelve displayName null cuando el usuario nunca cargó su nombre — no inventa uno', () => {
    // El fallback (usar el email) es decisión del CONSUMIDOR, no del port: acá
    // el dato viaja tal cual está en la base.
    return adapter.listarPorIds(tenantA, [userSinNombre]).then((filas) => {
      expect(filas).toEqual([
        { id: userSinNombre, displayName: null, email: `sin-nombre@${SLUG_A}.bo` },
      ]);
    });
  });

  it('un usuario de OTRA organización no resuelve: ni nombre ni email cruzan el tenant (Anti-31)', async () => {
    const filas = await adapter.listarPorIds(tenantA, [userDeB]);

    expect(filas).toEqual([]);
  });

  it('con ids mezclados devuelve SOLO los del tenant y omite el resto en silencio', async () => {
    const filas = await adapter.listarPorIds(tenantA, [
      userConNombre,
      userDeB,
      '00000000-0000-0000-0000-000000000000',
    ]);

    expect(filas.map((f) => f.id)).toEqual([userConNombre]);
  });

  it('sin ids no consulta y devuelve vacío', async () => {
    expect(await adapter.listarPorIds(tenantA, [])).toEqual([]);
  });
});
