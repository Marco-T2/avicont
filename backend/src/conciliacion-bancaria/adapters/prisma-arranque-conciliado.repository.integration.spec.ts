import { ClaseCuenta, NaturalezaCuenta, Prisma, PrismaClient } from '@prisma/client';

import type { PrismaService } from '@/common/prisma.service';

import { PrismaArranqueConciliadoRepository } from './prisma-arranque-conciliado.repository';

/**
 * Integration spec de `PrismaArranqueConciliadoRepository` contra Postgres
 * real (task 3.2 del change `informe-conciliacion-bancaria`, REQ-ICB-04,
 * design D3/D8).
 *
 * Cubre:
 *   - `vigenteA`: la declaración más reciente con `fecha <= corte`, desempate
 *     `fecha DESC, createdAt DESC`; null sin declaraciones aplicables.
 *   - Append-only DE VERDAD: una declaración posterior NO borra ni invalida
 *     la anterior — a un corte intermedio sigue aplicando la vieja y el
 *     historial conserva ambas (escenario de REQ-ICB-04).
 *   - Aislamiento por tenant (Anti-31) en los tres métodos.
 *
 * Correr con:
 *   DATABASE_URL=... pnpm exec jest src/conciliacion-bancaria/adapters/prisma-arranque-conciliado
 */
describe('PrismaArranqueConciliadoRepository (integration vs Postgres)', () => {
  const SLUG_A = 'org-test-arranque-repo-a';
  const SLUG_B = 'org-test-arranque-repo-b';

  let prisma: PrismaClient;
  let repo: PrismaArranqueConciliadoRepository;
  let tenantA: string;
  let tenantB: string;
  let cuentaBancariaA: string;
  let cuentaBancariaA2: string;
  let cuentaBancariaB: string;

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();
    repo = new PrismaArranqueConciliadoRepository(prisma as unknown as PrismaService);
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

    [cuentaBancariaA, cuentaBancariaA2, cuentaBancariaB] = await Promise.all([
      crearCuentaBancaria(tenantA, '1.1.1.002'),
      crearCuentaBancaria(tenantA, '1.1.1.003'),
      crearCuentaBancaria(tenantB, '1.1.1.002'),
    ]);
  });

  async function crearCuentaBancaria(
    organizationId: string,
    codigoInterno: string,
  ): Promise<string> {
    const cuenta = await prisma.cuenta.create({
      data: {
        organizationId,
        codigoInterno,
        nombre: `Banco ${codigoInterno}`,
        claseCuenta: ClaseCuenta.ACTIVO,
        naturaleza: NaturalezaCuenta.DEUDORA,
        nivel: 4,
        esDetalle: true,
        requiereContacto: false,
      },
    });
    const cb = await prisma.cuentaBancaria.create({
      data: {
        organizationId,
        cuentaId: cuenta.id,
        alias: `Cuenta ${codigoInterno}`,
        perfilExtracto: 'BANCOSOL_XLSX',
        numeroCuenta: null,
        moneda: 'BOB',
      },
    });
    return cb.id;
  }

  async function cleanup() {
    const orgs = await prisma.organization.findMany({
      where: { slug: { in: [SLUG_A, SLUG_B] } },
      select: { id: true },
    });
    const orgIds = orgs.map((o) => o.id);
    if (orgIds.length > 0) {
      await prisma.arranqueConciliado.deleteMany({ where: { organizationId: { in: orgIds } } });
      await prisma.cuentaBancaria.deleteMany({ where: { organizationId: { in: orgIds } } });
      await prisma.cuenta.deleteMany({ where: { organizationId: { in: orgIds } } });
    }
    await prisma.organization.deleteMany({ where: { slug: { in: [SLUG_A, SLUG_B] } } });
  }

  const dia = (year: number, month1a12: number, day: number) =>
    new Date(Date.UTC(year, month1a12 - 1, day));

  const datos = (cuentaBancariaId: string, fecha: Date, residual = '0.00') => ({
    cuentaBancariaId,
    fecha,
    saldoExtracto: new Prisma.Decimal('10500.00'),
    saldoLibros: new Prisma.Decimal('10000.00'),
    diferenciaResidual: new Prisma.Decimal(residual),
    nota: null,
    declaradoPorUserId: 'user-test',
    partidasAbiertas: [] as const,
  });

  // Siembra directa con `createdAt` explícito — para controlar el desempate.
  async function sembrar(
    organizationId: string,
    cuentaBancariaId: string,
    fecha: Date,
    createdAt: Date,
    residual: string,
  ) {
    const { partidasAbiertas: _omitidas, ...acto } = datos(cuentaBancariaId, fecha, residual);
    return prisma.arranqueConciliado.create({
      data: { organizationId, ...acto, createdAt },
    });
  }

  // ==========================================================
  // crear
  // ==========================================================

  it('crear — persiste la declaración estampando el organizationId del tenant', async () => {
    const fila = await repo.crear(tenantA, datos(cuentaBancariaA, dia(2026, 6, 30), '500.00'));

    expect(fila.organizationId).toBe(tenantA);
    expect(fila.cuentaBancariaId).toBe(cuentaBancariaA);
    expect(fila.fecha.toISOString().slice(0, 10)).toBe('2026-06-30');
    expect(fila.diferenciaResidual.toFixed(2)).toBe('500.00');
    expect(fila.declaradoPorUserId).toBe('user-test');
  });

  // ==========================================================
  // vigenteA — selección y desempate
  // ==========================================================

  it('vigenteA — devuelve null sin declaraciones con fecha <= corte', async () => {
    expect(await repo.vigenteA(tenantA, cuentaBancariaA, dia(2026, 7, 31))).toBeNull();

    // Una declaración FUTURA al corte tampoco aplica.
    await repo.crear(tenantA, datos(cuentaBancariaA, dia(2026, 12, 31)));
    expect(await repo.vigenteA(tenantA, cuentaBancariaA, dia(2026, 7, 31))).toBeNull();
  });

  it('vigenteA — elige la declaración más reciente con fecha <= corte', async () => {
    await repo.crear(tenantA, datos(cuentaBancariaA, dia(2026, 3, 31), '100.00'));
    const vigente = await repo.crear(tenantA, datos(cuentaBancariaA, dia(2026, 6, 30), '500.00'));
    await repo.crear(tenantA, datos(cuentaBancariaA, dia(2026, 12, 31), '0.00'));

    const resultado = await repo.vigenteA(tenantA, cuentaBancariaA, dia(2026, 7, 31));
    expect(resultado?.id).toBe(vigente.id);

    // Corte EXACTAMENTE en la fecha declarada: inclusive (fecha <= corte).
    const enElDia = await repo.vigenteA(tenantA, cuentaBancariaA, dia(2026, 6, 30));
    expect(enElDia?.id).toBe(vigente.id);
  });

  it('vigenteA — misma fecha declarada dos veces: gana la de createdAt más reciente (D8)', async () => {
    const fecha = dia(2026, 6, 30);
    await sembrar(tenantA, cuentaBancariaA, fecha, new Date('2026-07-01T10:00:00.000Z'), '500.00');
    const correccion = await sembrar(
      tenantA,
      cuentaBancariaA,
      fecha,
      new Date('2026-07-02T10:00:00.000Z'),
      '0.00',
    );

    const resultado = await repo.vigenteA(tenantA, cuentaBancariaA, dia(2026, 7, 31));
    expect(resultado?.id).toBe(correccion.id);
    expect(resultado?.diferenciaResidual.toFixed(2)).toBe('0.00');
  });

  // ==========================================================
  // Append-only DE VERDAD — escenario de REQ-ICB-04
  // ==========================================================

  it('una declaración posterior NO borra ni invalida la anterior: al corte intermedio sigue aplicando la vieja', async () => {
    const junio = await repo.crear(tenantA, datos(cuentaBancariaA, dia(2026, 6, 30), '500.00'));
    const diciembre = await repo.crear(tenantA, datos(cuentaBancariaA, dia(2026, 12, 31), '0.00'));

    // El informe al 31/07 aplica la del 30/06 — la nueva no la invalidó.
    const alJulio = await repo.vigenteA(tenantA, cuentaBancariaA, dia(2026, 7, 31));
    expect(alJulio?.id).toBe(junio.id);
    expect(alJulio?.diferenciaResidual.toFixed(2)).toBe('500.00');

    // Y al 31/12 aplica la nueva.
    const alDiciembre = await repo.vigenteA(tenantA, cuentaBancariaA, dia(2026, 12, 31));
    expect(alDiciembre?.id).toBe(diciembre.id);

    // Ambas persisten, auditables.
    const historial = await repo.listarHistorial(tenantA, cuentaBancariaA);
    expect(historial.map((h) => h.id)).toEqual([diciembre.id, junio.id]);
  });

  // ==========================================================
  // listarHistorial
  // ==========================================================

  it('listarHistorial — orden fecha DESC, createdAt DESC; solo la cuenta pedida', async () => {
    const fecha = dia(2026, 6, 30);
    const primera = await sembrar(
      tenantA,
      cuentaBancariaA,
      fecha,
      new Date('2026-07-01T10:00:00.000Z'),
      '500.00',
    );
    const correccion = await sembrar(
      tenantA,
      cuentaBancariaA,
      fecha,
      new Date('2026-07-02T10:00:00.000Z'),
      '0.00',
    );
    const marzo = await repo.crear(tenantA, datos(cuentaBancariaA, dia(2026, 3, 31)));
    await repo.crear(tenantA, datos(cuentaBancariaA2, dia(2026, 6, 30))); // otra cuenta

    const historial = await repo.listarHistorial(tenantA, cuentaBancariaA);
    expect(historial.map((h) => h.id)).toEqual([correccion.id, primera.id, marzo.id]);
  });

  it('listarHistorial — vacío sin declaraciones', async () => {
    expect(await repo.listarHistorial(tenantA, cuentaBancariaA)).toEqual([]);
  });

  // ==========================================================
  // Aislamiento por tenant (Anti-31)
  // ==========================================================

  it('vigenteA y listarHistorial — nunca cruzan tenants, ni siquiera pasando la cuenta ajena', async () => {
    await repo.crear(tenantA, datos(cuentaBancariaA, dia(2026, 6, 30), '500.00'));
    await repo.crear(tenantB, datos(cuentaBancariaB, dia(2026, 6, 30), '999.00'));

    expect(await repo.vigenteA(tenantB, cuentaBancariaA, dia(2026, 7, 31))).toBeNull();
    expect(await repo.listarHistorial(tenantB, cuentaBancariaA)).toEqual([]);

    const propio = await repo.vigenteA(tenantB, cuentaBancariaB, dia(2026, 7, 31));
    expect(propio?.diferenciaResidual.toFixed(2)).toBe('999.00');
  });
});
