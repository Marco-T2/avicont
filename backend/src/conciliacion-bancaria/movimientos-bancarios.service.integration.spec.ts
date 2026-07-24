import {
  ClaseCuenta,
  EstadoComprobante,
  EstadoMovimientoBancario,
  GestionFiscalStatus,
  Moneda,
  NaturalezaCuenta,
  PeriodoFiscalStatus,
  PerfilExtracto,
  Prisma,
  PrismaClient,
  TipoComprobante,
} from '@prisma/client';

import { PrismaLineasCuentaReaderAdapter } from '@/comprobantes/adapters/prisma-lineas-cuenta-reader.adapter';
import type { PrismaService } from '@/common/prisma.service';

import { PrismaCuentaBancariaRepository } from './adapters/prisma-cuenta-bancaria.repository';
import { PrismaMatchConciliacionRepository } from './adapters/prisma-match-conciliacion.repository';
import { PrismaMovimientoBancarioRepository } from './adapters/prisma-movimiento-bancario.repository';
import { MatchConciliacionService } from './match-conciliacion.service';
import { MovimientosBancariosService } from './movimientos-bancarios.service';

/**
 * Integration spec de `MovimientosBancariosService` (tasks 5.27-5.30) contra
 * Postgres real — REQ-CB-18: ignorar / des-ignorar un movimiento bancario.
 *
 * Correr con:
 *   DATABASE_URL=... pnpm exec jest src/conciliacion-bancaria/movimientos-bancarios.service
 */
describe('MovimientosBancariosService (integration, REQ-CB-18)', () => {
  const SLUG_A = 'org-test-ignorar-a';
  const SLUG_B = 'org-test-ignorar-b';
  const USER = 'user-conciliador';

  let prisma: PrismaClient;
  let service: MovimientosBancariosService;
  let matchService: MatchConciliacionService;
  let tenantA: string;
  let tenantB: string;
  let cuentaBancoA: string;
  let cuentaBancariaA: string;
  let periodoA: string;
  let importacionA: string;

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();
    const p = prisma as unknown as PrismaService;
    const movRepo = new PrismaMovimientoBancarioRepository(p);
    const matchRepo = new PrismaMatchConciliacionRepository(p);
    const lineasReader = new PrismaLineasCuentaReaderAdapter(p);
    matchService = new MatchConciliacionService(
      p,
      new PrismaCuentaBancariaRepository(p),
      movRepo,
      matchRepo,
      lineasReader,
    );
    service = new MovimientosBancariosService(movRepo, matchService);
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

    const cuenta = await prisma.cuenta.create({
      data: {
        organizationId: tenantA,
        codigoInterno: '1.1.1.002',
        nombre: 'Banco cuenta corriente',
        claseCuenta: ClaseCuenta.ACTIVO,
        naturaleza: NaturalezaCuenta.DEUDORA,
        nivel: 4,
        esDetalle: true,
        requiereContacto: false,
      },
    });
    cuentaBancoA = cuenta.id;

    const cb = await prisma.cuentaBancaria.create({
      data: {
        organizationId: tenantA,
        cuentaId: cuentaBancoA,
        alias: 'Cuenta corriente',
        perfilExtracto: PerfilExtracto.BANCOSOL_XLSX,
        numeroCuenta: null,
        moneda: Moneda.BOB,
      },
    });
    cuentaBancariaA = cb.id;

    const gestion = await prisma.gestionFiscal.create({
      data: {
        organizationId: tenantA,
        year: 2026,
        mesInicio: 1,
        status: GestionFiscalStatus.ABIERTA,
      },
    });
    const periodo = await prisma.periodoFiscal.create({
      data: {
        organizationId: tenantA,
        gestionId: gestion.id,
        year: 2026,
        month: 6,
        ordenEnGestion: 6,
        status: PeriodoFiscalStatus.ABIERTO,
      },
    });
    periodoA = periodo.id;

    const imp = await prisma.importacionExtracto.create({
      data: {
        organizationId: tenantA,
        cuentaBancariaId: cuentaBancariaA,
        nombreArchivo: 'extracto.xlsx',
        sha256Archivo: 'a'.repeat(64),
        tamanioBytes: 100,
        perfilExtracto: PerfilExtracto.BANCOSOL_XLSX,
        fechaDesde: new Date(Date.UTC(2026, 5, 1)),
        fechaHasta: new Date(Date.UTC(2026, 5, 30)),
        coberturaDeclarada: false,
        estadoVerificacion: 'SIN_VERIFICAR',
        filasLeidas: 0,
        movimientosNuevos: 0,
        movimientosDuplicados: 0,
        importadoPorUserId: USER,
      },
    });
    importacionA = imp.id;
  });

  let hashSeq = 0;
  async function crearMovimiento(
    estado: EstadoMovimientoBancario = EstadoMovimientoBancario.PENDIENTE,
  ): Promise<string> {
    hashSeq += 1;
    const mov = await prisma.movimientoBancario.create({
      data: {
        organizationId: tenantA,
        cuentaBancariaId: cuentaBancariaA,
        importacionId: importacionA,
        fecha: new Date(Date.UTC(2026, 5, 10)),
        hora: null,
        monto: new Prisma.Decimal('1500.00'),
        tipo: 'CREDITO',
        moneda: Moneda.BOB,
        descripcion: 'DEPOSITO EN EFECTIVO',
        descripcionNormalizada: 'DEPOSITO EN EFECTIVO',
        referencia: null,
        saldo: null,
        contraparteNombre: null,
        contraparteDocumento: null,
        datosOriginales: {},
        ordinalDia: 0,
        hashDedup: `hash-ign-${hashSeq}`,
        estado,
      },
    });
    return mov.id;
  }

  async function crearComprobanteConLineaBanco(monto: string): Promise<string> {
    const comprobante = await prisma.comprobante.create({
      data: {
        organizationId: tenantA,
        tipo: TipoComprobante.DIARIO,
        numero: `D2606-00000${(hashSeq % 9) + 1}`,
        estado: EstadoComprobante.CONTABILIZADO,
        fechaContable: new Date(Date.UTC(2026, 5, 10)),
        periodoFiscalId: periodoA,
        glosa: 'Depósito de clientes',
        monedaPrincipal: Moneda.BOB,
        totalDebitoBob: new Prisma.Decimal('0.00'),
        totalCreditoBob: new Prisma.Decimal('0.00'),
        createdByUserId: USER,
        lineas: {
          create: [
            {
              organizationId: tenantA,
              orden: 1,
              cuentaId: cuentaBancoA,
              moneda: Moneda.BOB,
              debito: new Prisma.Decimal(monto),
              credito: new Prisma.Decimal('0'),
              tipoCambio: new Prisma.Decimal('1'),
              debitoBob: new Prisma.Decimal(monto),
              creditoBob: new Prisma.Decimal('0'),
            },
          ],
        },
      },
    });
    return comprobante.id;
  }

  async function cleanup() {
    const orgs = await prisma.organization.findMany({
      where: { slug: { in: [SLUG_A, SLUG_B] } },
      select: { id: true },
    });
    const orgIds = orgs.map((o) => o.id);
    if (orgIds.length > 0) {
      await prisma.matchConciliacion.deleteMany({ where: { organizationId: { in: orgIds } } });
      await prisma.movimientoBancario.deleteMany({ where: { organizationId: { in: orgIds } } });
      await prisma.importacionExtracto.deleteMany({ where: { organizationId: { in: orgIds } } });
      await prisma.cuentaBancaria.deleteMany({ where: { organizationId: { in: orgIds } } });
      await prisma.lineaComprobante.deleteMany({ where: { organizationId: { in: orgIds } } });
      await prisma.comprobante.deleteMany({ where: { organizationId: { in: orgIds } } });
      await prisma.periodoFiscal.deleteMany({ where: { organizationId: { in: orgIds } } });
      await prisma.gestionFiscal.deleteMany({ where: { organizationId: { in: orgIds } } });
      await prisma.cuenta.deleteMany({ where: { organizationId: { in: orgIds } } });
    }
    await prisma.organization.deleteMany({ where: { slug: { in: [SLUG_A, SLUG_B] } } });
  }

  // ==========================================================
  // 5.27 — REQ-CB-18 escenario 1: ignorar un PENDIENTE
  // ==========================================================

  it('5.27 — ignorar un movimiento PENDIENTE ⇒ estado pasa a IGNORADO', async () => {
    const id = await crearMovimiento(EstadoMovimientoBancario.PENDIENTE);

    const actualizado = await service.cambiarEstado(tenantA, id, 'IGNORADO');

    expect(actualizado.estado).toBe(EstadoMovimientoBancario.IGNORADO);
    const enDb = await prisma.movimientoBancario.findUniqueOrThrow({ where: { id } });
    expect(enDb.estado).toBe(EstadoMovimientoBancario.IGNORADO);
  });

  // ==========================================================
  // 5.28 — REQ-CB-18 escenario 2: des-ignorar
  // ==========================================================

  it('5.28 — des-ignorar un movimiento IGNORADO ⇒ estado vuelve a PENDIENTE', async () => {
    const id = await crearMovimiento(EstadoMovimientoBancario.IGNORADO);

    const actualizado = await service.cambiarEstado(tenantA, id, 'PENDIENTE');

    expect(actualizado.estado).toBe(EstadoMovimientoBancario.PENDIENTE);
    const enDb = await prisma.movimientoBancario.findUniqueOrThrow({ where: { id } });
    expect(enDb.estado).toBe(EstadoMovimientoBancario.PENDIENTE);
  });

  // ==========================================================
  // 5.29 — REQ-CB-18 escenario 3: ignorar no crea ni borra matches
  // ==========================================================

  it('5.29 — ignorar un PENDIENTE sin match no crea ni borra ningún MatchConciliacion, y no borra el movimiento', async () => {
    const id = await crearMovimiento(EstadoMovimientoBancario.PENDIENTE);
    expect(await prisma.matchConciliacion.count({ where: { organizationId: tenantA } })).toBe(0);

    await service.cambiarEstado(tenantA, id, 'IGNORADO');

    expect(await prisma.matchConciliacion.count({ where: { organizationId: tenantA } })).toBe(0);
    const enDb = await prisma.movimientoBancario.findUnique({ where: { id } });
    expect(enDb).not.toBeNull();
    expect(enDb!.estado).toBe(EstadoMovimientoBancario.IGNORADO);
    // Lo único que cambió es el estado: el monto y la descripción siguen igual.
    expect(enDb!.monto.toFixed(2)).toBe('1500.00');
    expect(enDb!.descripcion).toBe('DEPOSITO EN EFECTIVO');
  });

  // ==========================================================
  // 5.30 — REQ-CB-18 escenario 4: CONCILIADO con vínculo sano ⇒ rechazo
  // ==========================================================

  it('5.30 — ignorar un movimiento CONCILIADO con vínculo SANO ⇒ 422 MOVIMIENTO_YA_CONCILIADO', async () => {
    const movimientoId = await crearMovimiento();
    const comprobanteId = await crearComprobanteConLineaBanco('1500.00');
    await matchService.crearMatch(tenantA, USER, {
      movimientoBancarioId: movimientoId,
      comprobanteId,
      orden: 1,
    });

    await expect(service.cambiarEstado(tenantA, movimientoId, 'IGNORADO')).rejects.toMatchObject({
      code: 'CONCILIACION_MOVIMIENTO_YA_CONCILIADO',
    });

    // Nada cambió: sigue CONCILIADO y el match sigue vivo.
    const enDb = await prisma.movimientoBancario.findUniqueOrThrow({ where: { id: movimientoId } });
    expect(enDb.estado).toBe(EstadoMovimientoBancario.CONCILIADO);
    expect(
      await prisma.matchConciliacion.count({ where: { movimientoBancarioId: movimientoId } }),
    ).toBe(1);
  });

  it('5.30bis — con el vínculo ROTO el movimiento SÍ se puede ignorar, y el match NO se borra (REQ-CB-18)', async () => {
    const movimientoId = await crearMovimiento();
    const comprobanteId = await crearComprobanteConLineaBanco('1500.00');
    await matchService.crearMatch(tenantA, USER, {
      movimientoBancarioId: movimientoId,
      comprobanteId,
      orden: 1,
    });

    // El comprobante se edita y la línea deja de coincidir con el snapshot.
    await prisma.lineaComprobante.updateMany({
      where: { comprobanteId, orden: 1 },
      data: { debito: new Prisma.Decimal('99.00'), debitoBob: new Prisma.Decimal('99.00') },
    });

    const actualizado = await service.cambiarEstado(tenantA, movimientoId, 'IGNORADO');
    expect(actualizado.estado).toBe(EstadoMovimientoBancario.IGNORADO);
    // REQ-CB-18: ignorar NUNCA crea ni borra un MatchConciliacion.
    expect(
      await prisma.matchConciliacion.count({ where: { movimientoBancarioId: movimientoId } }),
    ).toBe(1);
  });

  it('des-ignorar un movimiento CONCILIADO con vínculo sano ⇒ 422 (hay que deshacer el match primero)', async () => {
    const movimientoId = await crearMovimiento();
    const comprobanteId = await crearComprobanteConLineaBanco('1500.00');
    await matchService.crearMatch(tenantA, USER, {
      movimientoBancarioId: movimientoId,
      comprobanteId,
      orden: 1,
    });

    await expect(service.cambiarEstado(tenantA, movimientoId, 'PENDIENTE')).rejects.toMatchObject({
      code: 'CONCILIACION_MOVIMIENTO_YA_CONCILIADO',
    });
    const enDb = await prisma.movimientoBancario.findUniqueOrThrow({ where: { id: movimientoId } });
    expect(enDb.estado).toBe(EstadoMovimientoBancario.CONCILIADO);
  });

  // ==========================================================
  // REQ-CB-13 — aislamiento cross-tenant
  // ==========================================================

  it('REQ-CB-13 — cambiar el estado de un movimiento de otro tenant ⇒ 404, sin efecto', async () => {
    const id = await crearMovimiento(EstadoMovimientoBancario.PENDIENTE);

    await expect(service.cambiarEstado(tenantB, id, 'IGNORADO')).rejects.toMatchObject({
      code: 'CONCILIACION_MOVIMIENTO_NO_ENCONTRADO',
    });

    const enDb = await prisma.movimientoBancario.findUniqueOrThrow({ where: { id } });
    expect(enDb.estado).toBe(EstadoMovimientoBancario.PENDIENTE);
  });

  it('ignorar un movimiento ya IGNORADO es idempotente', async () => {
    const id = await crearMovimiento(EstadoMovimientoBancario.IGNORADO);
    const actualizado = await service.cambiarEstado(tenantA, id, 'IGNORADO');
    expect(actualizado.estado).toBe(EstadoMovimientoBancario.IGNORADO);
  });
});
