import { ClaseCuenta, NaturalezaCuenta, Prisma, PrismaClient } from '@prisma/client';

import type { PrismaService } from '@/common/prisma.service';

import { PrismaCuentaBancariaRepository } from './prisma-cuenta-bancaria.repository';

/**
 * Integration spec del `PrismaCuentaBancariaRepository` contra Postgres real.
 * Valida las reglas que SOLO Postgres puede contestar:
 *   - UNIQUE `(organizationId, cuentaId)` — REQ-CB-01.
 *   - UNIQUE `(organizationId, perfilExtracto, numeroCuenta)` — CRITICAL-5
 *     (NUNCA `banco`, ver design.md).
 *   - Multi-tenancy: ningún método cruza tenants (REQ-CB-13).
 */
describe('PrismaCuentaBancariaRepository (integration)', () => {
  const SLUG_A = 'org-test-cb-a';
  const SLUG_B = 'org-test-cb-b';

  let prisma: PrismaClient;
  let repo: PrismaCuentaBancariaRepository;
  let tenantA: string;
  let tenantB: string;
  let cuentaA1: string;
  let cuentaA2: string;
  let cuentaB1: string;

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();
    repo = new PrismaCuentaBancariaRepository(prisma as unknown as PrismaService);
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

    const [cA1, cA2, cB1] = await Promise.all([
      crearCuenta(tenantA, '1.1.1.001'),
      crearCuenta(tenantA, '1.1.1.002'),
      crearCuenta(tenantB, '1.1.1.001'),
    ]);
    cuentaA1 = cA1.id;
    cuentaA2 = cA2.id;
    cuentaB1 = cB1.id;
  });

  async function crearCuenta(organizationId: string, codigoInterno: string) {
    return prisma.cuenta.create({
      data: {
        organizationId,
        codigoInterno,
        nombre: `Caja ${codigoInterno}`,
        claseCuenta: ClaseCuenta.ACTIVO,
        naturaleza: NaturalezaCuenta.DEUDORA,
        nivel: 4,
        esDetalle: true,
        requiereContacto: false,
      },
    });
  }

  async function cleanup() {
    const orgs = await prisma.organization.findMany({
      where: { slug: { in: [SLUG_A, SLUG_B] } },
      select: { id: true },
    });
    const orgIds = orgs.map((o) => o.id);
    if (orgIds.length > 0) {
      await prisma.cuentaBancaria.deleteMany({ where: { organizationId: { in: orgIds } } });
      await prisma.cuenta.deleteMany({ where: { organizationId: { in: orgIds } } });
    }
    await prisma.organization.deleteMany({ where: { slug: { in: [SLUG_A, SLUG_B] } } });
  }

  const baseData = (
    cuentaId: string,
    overrides: Partial<Parameters<PrismaCuentaBancariaRepository['create']>[1]> = {},
  ) => ({
    cuentaId,
    alias: 'Cuenta corriente BancoSol',
    perfilExtracto: 'BANCOSOL_XLSX' as const,
    numeroCuenta: null,
    moneda: 'BOB' as const,
    ...overrides,
  });

  // ==========================================================
  // create — happy path + REQ-CB-13 aislamiento
  // ==========================================================

  it('create — persiste con activa=true por default y respeta el resto del payload', async () => {
    const cb = await repo.create(tenantA, baseData(cuentaA1));
    expect(cb.activa).toBe(true);
    expect(cb.organizationId).toBe(tenantA);
    expect(cb.cuentaId).toBe(cuentaA1);
    expect(cb.perfilExtracto).toBe('BANCOSOL_XLSX');
    expect(cb.numeroCuenta).toBeNull();
  });

  it('create — acepta numeroCuenta no-null', async () => {
    const cb = await repo.create(tenantA, baseData(cuentaA1, { numeroCuenta: '1191959-000-001' }));
    expect(cb.numeroCuenta).toBe('1191959-000-001');
  });

  // ==========================================================
  // @@unique([organizationId, cuentaId]) — REQ-CB-01
  // ==========================================================

  it('UNIQUE (organizationId, cuentaId) — falla al crear una segunda cuenta bancaria sobre la misma cuenta del plan', async () => {
    await repo.create(tenantA, baseData(cuentaA1));

    await expect(repo.create(tenantA, baseData(cuentaA1))).rejects.toThrow(
      Prisma.PrismaClientKnownRequestError,
    );
  });

  it('UNIQUE (organizationId, cuentaId) — permite el mismo cuentaId en tenants distintos', async () => {
    await repo.create(tenantA, baseData(cuentaA1));
    const cbB = await repo.create(tenantB, baseData(cuentaB1));
    expect(cbB.organizationId).toBe(tenantB);
  });

  // ==========================================================
  // @@unique([organizationId, perfilExtracto, numeroCuenta]) — CRITICAL-5
  // ==========================================================

  it('UNIQUE (organizationId, perfilExtracto, numeroCuenta) — falla con el mismo perfil + número', async () => {
    await repo.create(tenantA, baseData(cuentaA1, { numeroCuenta: '1191959-000-001' }));

    await expect(
      repo.create(tenantA, baseData(cuentaA2, { numeroCuenta: '1191959-000-001' })),
    ).rejects.toThrow(Prisma.PrismaClientKnownRequestError);
  });

  it('UNIQUE (organizationId, perfilExtracto, numeroCuenta) — Postgres permite múltiples NULL', async () => {
    const cb1 = await repo.create(tenantA, baseData(cuentaA1, { numeroCuenta: null }));
    const cb2 = await repo.create(tenantA, baseData(cuentaA2, { numeroCuenta: null }));
    expect(cb1.numeroCuenta).toBeNull();
    expect(cb2.numeroCuenta).toBeNull();
  });

  // ==========================================================
  // findByCuentaId / findByPerfilYNumero
  // ==========================================================

  it('findByCuentaId — devuelve la fila del tenant, null si no existe', async () => {
    const cb = await repo.create(tenantA, baseData(cuentaA1));
    const found = await repo.findByCuentaId(tenantA, cuentaA1);
    expect(found?.id).toBe(cb.id);
    expect(await repo.findByCuentaId(tenantA, cuentaA2)).toBeNull();
  });

  it('findByPerfilYNumero — excludeId omite la propia fila (para updates)', async () => {
    const cb = await repo.create(tenantA, baseData(cuentaA1, { numeroCuenta: '1191959-000-001' }));

    const conflicto = await repo.findByPerfilYNumero(tenantA, 'BANCOSOL_XLSX', '1191959-000-001');
    expect(conflicto?.id).toBe(cb.id);

    const sinConflicto = await repo.findByPerfilYNumero(
      tenantA,
      'BANCOSOL_XLSX',
      '1191959-000-001',
      cb.id,
    );
    expect(sinConflicto).toBeNull();
  });

  // ==========================================================
  // REQ-CB-13 — aislamiento cross-tenant
  // ==========================================================

  it('findById — 404 lógico (null) para una cuenta bancaria de otro tenant', async () => {
    const cb = await repo.create(tenantA, baseData(cuentaA1));
    expect(await repo.findById(tenantB, cb.id)).toBeNull();
    expect(await repo.findById(tenantA, cb.id)).not.toBeNull();
  });

  it('listar — siempre acotado al tenant activo', async () => {
    await repo.create(tenantA, baseData(cuentaA1));
    await repo.create(tenantB, baseData(cuentaB1));

    const { items, total } = await repo.listar(tenantA, {}, { page: 1, limit: 20 });
    expect(total).toBe(1);
    expect(items.every((i) => i.organizationId === tenantA)).toBe(true);
  });

  it('update — no modifica ni encuentra una fila de otro tenant', async () => {
    const cb = await repo.create(tenantA, baseData(cuentaA1));
    await expect(repo.update(tenantB, cb.id, { alias: 'Hackeada' })).rejects.toThrow();
    const intacta = await repo.findById(tenantA, cb.id);
    expect(intacta?.alias).toBe('Cuenta corriente BancoSol');
  });

  it('eliminar — devuelve 0 si el id pertenece a otro tenant', async () => {
    const cb = await repo.create(tenantA, baseData(cuentaA1));
    const count = await repo.eliminar(tenantB, cb.id);
    expect(count).toBe(0);
    expect(await repo.findById(tenantA, cb.id)).not.toBeNull();
  });

  // ==========================================================
  // update — happy path
  // ==========================================================

  it('update — aplica solo los campos presentes', async () => {
    const cb = await repo.create(tenantA, baseData(cuentaA1));
    const updated = await repo.update(tenantA, cb.id, { alias: 'Nuevo alias' });
    expect(updated.alias).toBe('Nuevo alias');
    expect(updated.perfilExtracto).toBe('BANCOSOL_XLSX');
  });

  it('update — permite limpiar numeroCuenta explícitamente a null', async () => {
    const cb = await repo.create(tenantA, baseData(cuentaA1, { numeroCuenta: '1191959-000-001' }));
    const updated = await repo.update(tenantA, cb.id, { numeroCuenta: null });
    expect(updated.numeroCuenta).toBeNull();
  });

  // ==========================================================
  // eliminar — happy path
  // ==========================================================

  it('eliminar — borra la fila', async () => {
    const cb = await repo.create(tenantA, baseData(cuentaA1));
    const count = await repo.eliminar(tenantA, cb.id);
    expect(count).toBe(1);
    expect(await repo.findById(tenantA, cb.id)).toBeNull();
  });
});
