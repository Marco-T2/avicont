import {
  ClaseCuenta,
  Moneda,
  NaturalezaCuenta,
  PerfilExtracto,
  Prisma,
  PrismaClient,
} from '@prisma/client';

import type { PrismaService } from '@/common/prisma.service';
import { CuentasReaderPort } from '@/cuentas/ports/cuentas-reader.port';

import { PrismaCuentaBancariaRepository } from './adapters/prisma-cuenta-bancaria.repository';
import { PrismaImportacionExtractoRepository } from './adapters/prisma-importacion-extracto.repository';
import { CuentasBancariasService } from './cuentas-bancarias.service';
import { CuentaBancariaNoEncontradaError } from './domain/cuenta-bancaria-errors';
import { IntegridadExtractosService } from './integridad-extractos.service';

/**
 * Integration spec de `IntegridadExtractosService` contra Postgres real
 * (REQ-CB-09/23, REQ-CB-13).
 *
 * El dominio (`detectarHuecos`, `detectarDiscontinuidades`) ya está cubierto
 * al 100% en sus specs unitarios. Lo que se prueba acá es el CABLEADO: que el
 * service lea las importaciones reales, mapee bien `saldoInicial`/`saldoFinal`
 * (un intercambio en el mapeo pasaría desapercibido para un empty-check) y
 * respete el aislamiento por tenant.
 *
 * Correr con:
 *   DATABASE_URL=... pnpm exec jest src/conciliacion-bancaria/integridad-extractos.service
 */
describe('IntegridadExtractosService (integration, REQ-CB-09/23/13)', () => {
  const SLUG_A = 'org-test-integridad-a';
  const SLUG_B = 'org-test-integridad-b';

  let prisma: PrismaClient;
  let service: IntegridadExtractosService;
  let tenantA: string;
  let tenantB: string;
  let cuentaBancariaA: string;
  let cuentaBancariaB: string;
  let ownerA: string;
  let ownerB: string;

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();

    const p = prisma as unknown as PrismaService;
    // `evaluar` solo usa `findById` de CuentasBancariasService (el 404
    // cross-tenant); el reader del plan de cuentas no interviene en esta ruta.
    const cuentasBancarias = new CuentasBancariasService(
      new PrismaCuentaBancariaRepository(p),
      {} as CuentasReaderPort,
    );
    service = new IntegridadExtractosService(
      cuentasBancarias,
      new PrismaImportacionExtractoRepository(p),
    );
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await cleanup();

    const [a, b] = await Promise.all([
      prisma.organization.create({ data: { slug: SLUG_A, name: 'Org Integridad A' } }),
      prisma.organization.create({ data: { slug: SLUG_B, name: 'Org Integridad B' } }),
    ]);
    tenantA = a.id;
    tenantB = b.id;

    const [userA, userB] = await Promise.all([
      prisma.user.create({
        data: { email: 'owner@integridad-a.bo', hashedPassword: 'x', isEmailVerified: true },
      }),
      prisma.user.create({
        data: { email: 'owner@integridad-b.bo', hashedPassword: 'x', isEmailVerified: true },
      }),
    ]);
    ownerA = userA.id;
    ownerB = userB.id;

    cuentaBancariaA = await crearCuentaBancaria(tenantA);
    cuentaBancariaB = await crearCuentaBancaria(tenantB);
  });

  // ==========================================================
  // Fixtures
  // ==========================================================

  async function crearCuentaBancaria(organizationId: string): Promise<string> {
    const cuenta = await prisma.cuenta.create({
      data: {
        organizationId,
        codigoInterno: '1.1.1.002',
        nombre: 'Banco cuenta corriente',
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
        alias: 'BancoSol corriente',
        perfilExtracto: PerfilExtracto.BANCOSOL_XLSX,
        numeroCuenta: null,
        moneda: Moneda.BOB,
      },
    });
    return cb.id;
  }

  let shaSeq = 0;
  async function crearImportacion(opts: {
    organizationId: string;
    cuentaBancariaId: string;
    userId: string;
    desde: string;
    hasta: string;
    saldoInicial: string | null;
    saldoFinal: string | null;
  }): Promise<string> {
    shaSeq += 1;
    const imp = await prisma.importacionExtracto.create({
      data: {
        organizationId: opts.organizationId,
        cuentaBancariaId: opts.cuentaBancariaId,
        nombreArchivo: `extracto-${shaSeq}.xlsx`,
        sha256Archivo: String(shaSeq).padStart(64, 'a'),
        tamanioBytes: 100,
        perfilExtracto: PerfilExtracto.BANCOSOL_XLSX,
        fechaDesde: new Date(`${opts.desde}T00:00:00.000Z`),
        fechaHasta: new Date(`${opts.hasta}T00:00:00.000Z`),
        coberturaDeclarada: false,
        saldoInicial: opts.saldoInicial === null ? null : new Prisma.Decimal(opts.saldoInicial),
        saldoFinal: opts.saldoFinal === null ? null : new Prisma.Decimal(opts.saldoFinal),
        estadoVerificacion: 'VERIFICADO',
        filasLeidas: 10,
        movimientosNuevos: 10,
        movimientosDuplicados: 0,
        importadoPorUserId: opts.userId,
      },
    });
    return imp.id;
  }

  function impA(
    desde: string,
    hasta: string,
    saldoInicial: string | null,
    saldoFinal: string | null,
  ): Promise<string> {
    return crearImportacion({
      organizationId: tenantA,
      cuentaBancariaId: cuentaBancariaA,
      userId: ownerA,
      desde,
      hasta,
      saldoInicial,
      saldoFinal,
    });
  }

  async function cleanup() {
    const orgs = await prisma.organization.findMany({
      where: { slug: { in: [SLUG_A, SLUG_B] } },
      select: { id: true },
    });
    const orgIds = orgs.map((o) => o.id);
    if (orgIds.length > 0) {
      await prisma.importacionExtracto.deleteMany({ where: { organizationId: { in: orgIds } } });
      // La fila "intrusa" del test Anti-31 apunta a una cuenta bancaria de A
      // con organizationId de B — el barrido por org ya la captura, pero
      // limpiamos también por cuenta bancaria por robustez.
      await prisma.importacionExtracto.deleteMany({
        where: { cuentaBancaria: { organizationId: { in: orgIds } } },
      });
      await prisma.cuentaBancaria.deleteMany({ where: { organizationId: { in: orgIds } } });
      await prisma.cuenta.deleteMany({ where: { organizationId: { in: orgIds } } });
    }
    await prisma.organization.deleteMany({ where: { slug: { in: [SLUG_A, SLUG_B] } } });
    await prisma.user.deleteMany({
      where: { email: { in: ['owner@integridad-a.bo', 'owner@integridad-b.bo'] } },
    });
  }

  // ==========================================================
  // Serie íntegra — el compañero NO vacío de los empty-checks
  // ==========================================================

  it('serie contigua con empalme exacto de saldos: sin huecos ni discontinuidades', async () => {
    // Mayo cierra en 1500.00 y junio abre en 1500.00 EXACTO: el empalme
    // perfecto que REQ-CB-23 considera continuo.
    await impA('2026-05-01', '2026-05-31', '1000.00', '1500.00');
    await impA('2026-06-01', '2026-06-30', '1500.00', '1800.00');

    const res = await service.evaluar(tenantA, cuentaBancariaA);

    expect(res.huecos).toEqual([]);
    expect(res.discontinuidades).toEqual([]);
  });

  // ==========================================================
  // REQ-CB-09 — huecos de cobertura
  // ==========================================================

  it('hueco entre mayo y julio: reporta junio completo y NO inventa discontinuidad entre las separadas', async () => {
    // 1500.00 (fin de mayo) ≠ 4000.00 (inicio de julio): si la regla de
    // contigüidad fallara, esto se reportaría como discontinuidad. Es un falso
    // positivo — en junio pasaron movimientos que ningún extracto trajo; el
    // hallazgo real es el HUECO.
    await impA('2026-05-01', '2026-05-31', '1000.00', '1500.00');
    await impA('2026-07-01', '2026-07-31', '4000.00', '4200.00');

    const res = await service.evaluar(tenantA, cuentaBancariaA);

    expect(res.huecos).toHaveLength(1);
    expect(res.huecos[0]?.desde.toIso()).toBe('2026-06-01');
    expect(res.huecos[0]?.hasta.toIso()).toBe('2026-06-30');
    expect(res.discontinuidades).toEqual([]);
  });

  // ==========================================================
  // REQ-CB-23 — discontinuidades de saldo
  // ==========================================================

  it('discontinuidad entre contiguas: reporta ids, ambos saldos y la diferencia exacta', async () => {
    // Mayo cierra en 1517.25 y junio (contiguo: arranca el día siguiente)
    // abre en 1717.30 — faltan Bs 200.05 de la serie corrida. Exactamente el
    // agujero que deja la mutilación por los extremos que el checksum DERIVADO
    // no puede ver.
    const mayoId = await impA('2026-05-01', '2026-05-31', '1000.00', '1517.25');
    const junioId = await impA('2026-06-01', '2026-06-30', '1717.30', '1900.00');

    const res = await service.evaluar(tenantA, cuentaBancariaA);

    expect(res.huecos).toEqual([]);
    expect(res.discontinuidades).toHaveLength(1);
    const disc = res.discontinuidades[0];
    expect(disc?.anteriorId).toBe(mayoId);
    expect(disc?.siguienteId).toBe(junioId);
    // Montos REALES: si el mapeo del service intercambiara saldoInicial y
    // saldoFinal, saldoFinalAnterior valdría '1000.00' y la diferencia '900.00'
    // — estas aserciones son las que cazan ese intercambio.
    expect(disc?.saldoFinalAnterior.toBob()).toBe('1517.25');
    expect(disc?.saldoInicialSiguiente.toBob()).toBe('1717.30');
    expect(disc?.diferencia.toBob()).toBe('200.05');
  });

  it('hueco y discontinuidad conviven sin pisarse: cada hallazgo en su tramo', async () => {
    // mayo→junio: contiguas con salto de 200.05 → discontinuidad.
    // junio→agosto: julio sin cubrir → hueco, y NINGUNA discontinuidad entre
    // ellas aunque 1900.00 ≠ 5000.00 (no son contiguas).
    const mayoId = await impA('2026-05-01', '2026-05-31', '1000.00', '1517.25');
    const junioId = await impA('2026-06-01', '2026-06-30', '1717.30', '1900.00');
    await impA('2026-08-01', '2026-08-31', '5000.00', '5100.00');

    const res = await service.evaluar(tenantA, cuentaBancariaA);

    expect(res.huecos).toHaveLength(1);
    expect(res.huecos[0]?.desde.toIso()).toBe('2026-07-01');
    expect(res.huecos[0]?.hasta.toIso()).toBe('2026-07-31');

    expect(res.discontinuidades).toHaveLength(1);
    expect(res.discontinuidades[0]?.anteriorId).toBe(mayoId);
    expect(res.discontinuidades[0]?.siguienteId).toBe(junioId);
    expect(res.discontinuidades[0]?.diferencia.toBob()).toBe('200.05');
  });

  it('solapamiento: los saldos describen momentos distintos — ni hueco ni discontinuidad', async () => {
    // La segunda arranca DENTRO de mayo: sus saldos no son comparables con el
    // cierre de la primera (misma serie corrida, momentos distintos).
    await impA('2026-05-01', '2026-05-31', '1000.00', '1500.00');
    await impA('2026-05-15', '2026-06-15', '700.00', '900.00');

    const res = await service.evaluar(tenantA, cuentaBancariaA);

    expect(res.huecos).toEqual([]);
    expect(res.discontinuidades).toEqual([]);
  });

  it('saldo null en la frontera: sin dato no hay veredicto (misma regla que SIN_VERIFICAR)', async () => {
    // Mayo no publica saldo final ni junio su inicial (REQ-CB-08): el sistema
    // no afirma nada que no pueda respaldar — aunque los saldos presentes
    // (1000.00 vs 1900.00) estén lejos de empalmar.
    await impA('2026-05-01', '2026-05-31', '1000.00', null);
    await impA('2026-06-01', '2026-06-30', null, '1900.00');

    const res = await service.evaluar(tenantA, cuentaBancariaA);

    expect(res.huecos).toEqual([]);
    expect(res.discontinuidades).toEqual([]);
  });

  // ==========================================================
  // REQ-CB-13 — aislamiento por tenant
  // ==========================================================

  it('404 cross-tenant: evaluar una cuenta bancaria REAL de otro tenant lanza CuentaBancariaNoEncontradaError', async () => {
    // Simétrico: cada tenant contra la cuenta REAL del otro — no contra un
    // uuid inexistente, que también daría 404 pero por otra razón.
    await expect(service.evaluar(tenantB, cuentaBancariaA)).rejects.toThrow(
      CuentaBancariaNoEncontradaError,
    );
    await expect(service.evaluar(tenantA, cuentaBancariaB)).rejects.toThrow(
      CuentaBancariaNoEncontradaError,
    );
  });

  it('defense in depth (Anti-31): una importación con organizationId ajeno no contamina el veredicto aunque apunte a la misma cuenta bancaria', async () => {
    // Serie íntegra en A...
    await impA('2026-05-01', '2026-05-31', '1000.00', '1500.00');
    await impA('2026-06-01', '2026-06-30', '1500.00', '1800.00');
    // ...y una fila intrusa: organizationId de B apuntando a la cuenta
    // bancaria de A (la FK lo permite — solo referencia a CuentaBancaria).
    // Si la query filtrara solo por cuentaBancariaId, esta fila metería un
    // hueco (julio ausente, agosto presente) y una serie descuadrada.
    await crearImportacion({
      organizationId: tenantB,
      cuentaBancariaId: cuentaBancariaA,
      userId: ownerB,
      desde: '2026-08-01',
      hasta: '2026-08-31',
      saldoInicial: '9999.99',
      saldoFinal: '0.01',
    });

    const res = await service.evaluar(tenantA, cuentaBancariaA);

    expect(res.huecos).toEqual([]);
    expect(res.discontinuidades).toEqual([]);
  });
});
