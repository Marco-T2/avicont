import { ClaseCuenta, NaturalezaCuenta, Prisma, PrismaClient } from '@prisma/client';

/**
 * Integration spec del SCHEMA de `ArranqueConciliado` contra Postgres real
 * (task 3.1 del change `informe-conciliacion-bancaria`, design D3/D8 y
 * REQ-ICB-04).
 *
 * Valida los invariantes que viven en la MIGRACIÓN, no en el adapter:
 *   - Append-only ESTRUCTURAL: NO existe UNIQUE sobre (cuenta, fecha) — dos
 *     declaraciones sobre la misma cuenta y fecha coexisten (D8: corregir
 *     hacia atrás deja el rastro de ambas).
 *   - Índice compuesto `(organizationId, cuentaBancariaId, fecha)` presente —
 *     es la cota de rendimiento de `vigenteA` (D3).
 *   - FK Restrict hacia `cuentas_bancarias`: un acto contable declarado no se
 *     borra por arrastre.
 *
 * Correr con:
 *   DATABASE_URL=... pnpm exec jest src/conciliacion-bancaria/adapters/arranque-conciliado.schema
 */
describe('ArranqueConciliado — schema (integration vs Postgres)', () => {
  const SLUG = 'org-test-arranque-schema';

  let prisma: PrismaClient;
  let tenantId: string;
  let cuentaBancariaId: string;

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await cleanup();
    const org = await prisma.organization.create({ data: { slug: SLUG, name: 'Org Arranque' } });
    tenantId = org.id;

    const cuenta = await prisma.cuenta.create({
      data: {
        organizationId: tenantId,
        codigoInterno: '1.1.1.002',
        nombre: 'Banco BOB',
        claseCuenta: ClaseCuenta.ACTIVO,
        naturaleza: NaturalezaCuenta.DEUDORA,
        nivel: 4,
        esDetalle: true,
        requiereContacto: false,
      },
    });

    const cuentaBancaria = await prisma.cuentaBancaria.create({
      data: {
        organizationId: tenantId,
        cuentaId: cuenta.id,
        alias: 'Cuenta corriente BancoSol',
        perfilExtracto: 'BANCOSOL_XLSX',
        numeroCuenta: null,
        moneda: 'BOB',
      },
    });
    cuentaBancariaId = cuentaBancaria.id;
  });

  async function cleanup() {
    const orgs = await prisma.organization.findMany({
      where: { slug: SLUG },
      select: { id: true },
    });
    const orgIds = orgs.map((o) => o.id);
    if (orgIds.length > 0) {
      await prisma.arranqueConciliado.deleteMany({ where: { organizationId: { in: orgIds } } });
      await prisma.cuentaBancaria.deleteMany({ where: { organizationId: { in: orgIds } } });
      await prisma.cuenta.deleteMany({ where: { organizationId: { in: orgIds } } });
    }
    await prisma.organization.deleteMany({ where: { slug: SLUG } });
  }

  const declaracion = (overrides: Partial<Prisma.ArranqueConciliadoUncheckedCreateInput> = {}) =>
    ({
      organizationId: tenantId,
      cuentaBancariaId,
      fecha: new Date(Date.UTC(2026, 5, 30)),
      saldoExtracto: new Prisma.Decimal('10500.00'),
      saldoLibros: new Prisma.Decimal('10000.00'),
      diferenciaResidual: new Prisma.Decimal('500.00'),
      nota: null,
      declaradoPorUserId: 'user-test',
      ...overrides,
    }) satisfies Prisma.ArranqueConciliadoUncheckedCreateInput;

  it('persiste una declaración con decimales exactos (18,2) y atribución', async () => {
    const fila = await prisma.arranqueConciliado.create({ data: declaracion() });

    expect(fila.saldoExtracto.toFixed(2)).toBe('10500.00');
    expect(fila.saldoLibros.toFixed(2)).toBe('10000.00');
    expect(fila.diferenciaResidual.toFixed(2)).toBe('500.00');
    expect(fila.declaradoPorUserId).toBe('user-test');
    expect(fila.fecha.toISOString().slice(0, 10)).toBe('2026-06-30');
    expect(fila.createdAt).toBeInstanceOf(Date);
  });

  it('append-only ESTRUCTURAL: dos declaraciones con la misma (cuenta, fecha) coexisten — sin UNIQUE', async () => {
    await prisma.arranqueConciliado.create({ data: declaracion() });
    // La corrección hacia atrás (D8) NO pisa la anterior: misma cuenta, misma
    // fecha, otro residuo. Si alguien agregara @@unique([cuentaBancariaId, fecha])
    // este test revienta con P2002.
    await prisma.arranqueConciliado.create({
      data: declaracion({ diferenciaResidual: new Prisma.Decimal('0.00') }),
    });

    const filas = await prisma.arranqueConciliado.findMany({
      where: { organizationId: tenantId, cuentaBancariaId },
    });
    expect(filas).toHaveLength(2);
  });

  it('existe el índice compuesto (organizationId, cuentaBancariaId, fecha) — cota de vigenteA (D3)', async () => {
    const indices = await prisma.$queryRaw<{ indexname: string }[]>`
      SELECT indexname FROM pg_indexes WHERE tablename = 'arranques_conciliados'
    `;
    expect(indices.map((i) => i.indexname)).toContain(
      'arranques_conciliados_organizationId_cuentaBancariaId_fecha_idx',
    );
  });

  it('FK Restrict: no se puede borrar la cuenta bancaria con arranques declarados', async () => {
    await prisma.arranqueConciliado.create({ data: declaracion() });

    await expect(prisma.cuentaBancaria.delete({ where: { id: cuentaBancariaId } })).rejects.toThrow(
      Prisma.PrismaClientKnownRequestError,
    );
  });
});
