import {
  ClaseCuenta,
  EstadoComprobante,
  EstadoMovimientoBancario,
  GestionFiscalStatus,
  LadoContable,
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

/**
 * Integration spec de `MatchConciliacionService` (tasks 5.15-5.23) contra
 * Postgres real. REQ-CB-17 (confirmar/deshacer, la acción CENTRAL del
 * producto) + REQ-CB-13 (aislamiento cross-tenant de `MatchConciliacion`).
 *
 * Correr con:
 *   DATABASE_URL=... pnpm exec jest src/conciliacion-bancaria/match-conciliacion.service
 */
describe('MatchConciliacionService (integration, REQ-CB-17/13)', () => {
  const SLUG_A = 'org-test-match-a';
  const SLUG_B = 'org-test-match-b';
  const USER = 'user-conciliador';

  let prisma: PrismaClient;
  let service: MatchConciliacionService;
  let tenantA: string;
  let tenantB: string;
  let cuentaBancoA: string;
  let cuentaOtraA: string;
  let cuentaBancariaA: string;
  let cuentaBancariaB: string;
  let cuentaBancoB: string;
  let periodoA: string;
  let periodoB: string;
  let importacionA: string;

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();
    const p = prisma as unknown as PrismaService;
    service = new MatchConciliacionService(
      p,
      new PrismaCuentaBancariaRepository(p),
      new PrismaMovimientoBancarioRepository(p),
      new PrismaMatchConciliacionRepository(p),
      new PrismaLineasCuentaReaderAdapter(p),
    );
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

    cuentaBancoA = await crearCuenta(tenantA, '1.1.1.002');
    cuentaOtraA = await crearCuenta(tenantA, '1.1.1.003');
    cuentaBancoB = await crearCuenta(tenantB, '1.1.1.002');

    cuentaBancariaA = await crearCuentaBancaria(tenantA, cuentaBancoA);
    cuentaBancariaB = await crearCuentaBancaria(tenantB, cuentaBancoB);

    periodoA = await crearPeriodo(tenantA);
    periodoB = await crearPeriodo(tenantB);

    importacionA = await crearImportacion(tenantA, cuentaBancariaA);
    // Tenant B queda con su isla completa (cuenta + cuenta bancaria + período)
    // para que los tests cross-tenant operen contra datos REALES de otra org,
    // no contra ids inexistentes.
  });

  // ==========================================================
  // Fixtures
  // ==========================================================

  async function crearCuenta(organizationId: string, codigoInterno: string): Promise<string> {
    const cuenta = await prisma.cuenta.create({
      data: {
        organizationId,
        codigoInterno,
        nombre: `Cuenta ${codigoInterno}`,
        claseCuenta: ClaseCuenta.ACTIVO,
        naturaleza: NaturalezaCuenta.DEUDORA,
        nivel: 4,
        esDetalle: true,
        requiereContacto: false,
      },
    });
    return cuenta.id;
  }

  async function crearCuentaBancaria(organizationId: string, cuentaId: string): Promise<string> {
    const cb = await prisma.cuentaBancaria.create({
      data: {
        organizationId,
        cuentaId,
        alias: 'Cuenta corriente',
        perfilExtracto: PerfilExtracto.BANCOSOL_XLSX,
        numeroCuenta: null,
        moneda: Moneda.BOB,
      },
    });
    return cb.id;
  }

  async function crearPeriodo(organizationId: string): Promise<string> {
    const gestion = await prisma.gestionFiscal.create({
      data: { organizationId, year: 2026, mesInicio: 1, status: GestionFiscalStatus.ABIERTA },
    });
    const periodo = await prisma.periodoFiscal.create({
      data: {
        organizationId,
        gestionId: gestion.id,
        year: 2026,
        month: 6,
        ordenEnGestion: 6,
        status: PeriodoFiscalStatus.ABIERTO,
      },
    });
    return periodo.id;
  }

  async function crearImportacion(
    organizationId: string,
    cuentaBancariaId: string,
  ): Promise<string> {
    const imp = await prisma.importacionExtracto.create({
      data: {
        organizationId,
        cuentaBancariaId,
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
    return imp.id;
  }

  interface LineaInput {
    cuentaId?: string;
    orden: number;
    debito?: string;
    credito?: string;
  }

  async function crearComprobante(
    organizationId: string,
    periodoFiscalId: string,
    cuentaBancoDefault: string,
    opts: {
      dia: number;
      numero: string | null;
      estado?: EstadoComprobante;
      anulado?: boolean;
      lineas: LineaInput[];
    },
  ): Promise<string> {
    const comprobante = await prisma.comprobante.create({
      data: {
        organizationId,
        tipo: TipoComprobante.DIARIO,
        numero: opts.numero,
        estado: opts.estado ?? EstadoComprobante.CONTABILIZADO,
        anulado: opts.anulado ?? false,
        fechaContable: new Date(Date.UTC(2026, 5, opts.dia)),
        periodoFiscalId,
        glosa: 'Depósito de clientes',
        monedaPrincipal: Moneda.BOB,
        totalDebitoBob: new Prisma.Decimal('0.00'),
        totalCreditoBob: new Prisma.Decimal('0.00'),
        createdByUserId: USER,
        lineas: {
          create: opts.lineas.map((l) => ({
            organizationId,
            orden: l.orden,
            cuentaId: l.cuentaId ?? cuentaBancoDefault,
            moneda: Moneda.BOB,
            debito: new Prisma.Decimal(l.debito ?? '0'),
            credito: new Prisma.Decimal(l.credito ?? '0'),
            tipoCambio: new Prisma.Decimal('1'),
            debitoBob: new Prisma.Decimal(l.debito ?? '0'),
            creditoBob: new Prisma.Decimal(l.credito ?? '0'),
          })),
        },
      },
    });
    return comprobante.id;
  }

  let hashSeq = 0;
  async function crearMovimiento(
    organizationId: string,
    cuentaBancariaId: string,
    importacionId: string,
    opts: { dia: number; monto: string; estado?: EstadoMovimientoBancario },
  ): Promise<string> {
    hashSeq += 1;
    const mov = await prisma.movimientoBancario.create({
      data: {
        organizationId,
        cuentaBancariaId,
        importacionId,
        fecha: new Date(Date.UTC(2026, 5, opts.dia)),
        hora: null,
        monto: new Prisma.Decimal(opts.monto),
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
        hashDedup: `hash-${hashSeq}`,
        estado: opts.estado ?? EstadoMovimientoBancario.PENDIENTE,
      },
    });
    return mov.id;
  }

  /** Atajo del escenario más común: 1 comprobante con 1 línea de banco + 1 movimiento. */
  async function escenarioSimple(monto = '1500.00', dia = 10) {
    const comprobanteId = await crearComprobante(tenantA, periodoA, cuentaBancoA, {
      dia,
      numero: 'D2606-000001',
      lineas: [
        { orden: 1, debito: monto },
        { orden: 2, cuentaId: cuentaOtraA, credito: monto },
      ],
    });
    const movimientoId = await crearMovimiento(tenantA, cuentaBancariaA, importacionA, {
      dia,
      monto,
    });
    return { comprobanteId, movimientoId };
  }

  /**
   * Matches existentes en los DOS tenants del test.
   *
   * Existe para que ninguna aserción use `matchConciliacion.count()` sin filtro:
   * la suite corre contra la BD de desarrollo compartida, así que un conteo
   * global mide también los datos que dejó cualquier otra suite —o el uso real
   * de la app— y el test pasa o falla por motivos ajenos a lo que verifica.
   */
  async function matchesDeLosTenantsDelTest(): Promise<number> {
    return prisma.matchConciliacion.count({
      where: { organizationId: { in: [tenantA, tenantB] } },
    });
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
  // 5.15 — REQ-CB-17 escenario 1: confirmar crea el match con snapshot
  // ==========================================================

  it('5.15 — confirmar una sugerencia crea el MatchConciliacion con snapshot de los 5 campos', async () => {
    const { comprobanteId, movimientoId } = await escenarioSimple();

    const match = await service.crearMatch(tenantA, USER, {
      movimientoBancarioId: movimientoId,
      comprobanteId,
      orden: 1,
      confianzaSugerida: 'ALTA',
    });

    expect(match.organizationId).toBe(tenantA);
    expect(match.comprobanteId).toBe(comprobanteId);
    expect(match.orden).toBe(1);
    // Los 5 campos del snapshot, tomados de la línea EN ESE INSTANTE (design §2.1).
    expect(match.snapshotCuentaId).toBe(cuentaBancoA);
    expect(match.snapshotMonto.toFixed(2)).toBe('1500.00');
    expect(match.snapshotTipo).toBe(LadoContable.DEBITO);
    expect(match.snapshotMoneda).toBe(Moneda.BOB);
    expect(match.snapshotFecha.toISOString().slice(0, 10)).toBe('2026-06-10');
    expect(match.confianzaSugerida).toBe('ALTA');
    expect(match.conciliadoPorUserId).toBe(USER);

    const mov = await prisma.movimientoBancario.findUniqueOrThrow({ where: { id: movimientoId } });
    expect(mov.estado).toBe(EstadoMovimientoBancario.CONCILIADO);
  });

  it('5.15bis — el snapshot toma el lado CREDITO cuando la línea es un crédito', async () => {
    const comprobanteId = await crearComprobante(tenantA, periodoA, cuentaBancoA, {
      dia: 12,
      numero: 'D2606-000002',
      lineas: [{ orden: 1, credito: '750.25' }],
    });
    const movimientoId = await crearMovimiento(tenantA, cuentaBancariaA, importacionA, {
      dia: 12,
      monto: '750.25',
    });

    const match = await service.crearMatch(tenantA, USER, {
      movimientoBancarioId: movimientoId,
      comprobanteId,
      orden: 1,
    });

    expect(match.snapshotTipo).toBe(LadoContable.CREDITO);
    expect(match.snapshotMonto.toFixed(2)).toBe('750.25');
    expect(match.confianzaSugerida).toBeNull();
  });

  // ==========================================================
  // 5.16 — REQ-CB-17 escenario 2: el movimiento ya tiene match
  // ==========================================================

  it('5.16 — confirmar contra un movimiento que YA tiene match ⇒ rechaza y no crea un segundo', async () => {
    const { comprobanteId, movimientoId } = await escenarioSimple();
    await service.crearMatch(tenantA, USER, {
      movimientoBancarioId: movimientoId,
      comprobanteId,
      orden: 1,
    });

    const otroComprobante = await crearComprobante(tenantA, periodoA, cuentaBancoA, {
      dia: 11,
      numero: 'D2606-000009',
      lineas: [{ orden: 1, debito: '1500.00' }],
    });

    await expect(
      service.crearMatch(tenantA, USER, {
        movimientoBancarioId: movimientoId,
        comprobanteId: otroComprobante,
        orden: 1,
      }),
    ).rejects.toMatchObject({ code: 'CONCILIACION_MOVIMIENTO_YA_TIENE_MATCH' });

    expect(
      await prisma.matchConciliacion.count({ where: { movimientoBancarioId: movimientoId } }),
    ).toBe(1);
  });

  // ==========================================================
  // 5.17 — REQ-CB-17 escenario 3: la línea ya está conciliada con vínculo SANO
  // ==========================================================

  it('5.17 — confirmar contra una línea con match SANO ⇒ 409 LINEA_YA_CONCILIADA, el match existente intacto', async () => {
    const { comprobanteId, movimientoId } = await escenarioSimple();
    const original = await service.crearMatch(tenantA, USER, {
      movimientoBancarioId: movimientoId,
      comprobanteId,
      orden: 1,
    });

    const otroMovimiento = await crearMovimiento(tenantA, cuentaBancariaA, importacionA, {
      dia: 10,
      monto: '1500.00',
    });

    await expect(
      service.crearMatch(tenantA, USER, {
        movimientoBancarioId: otroMovimiento,
        comprobanteId,
        orden: 1,
      }),
    ).rejects.toMatchObject({ code: 'CONCILIACION_LINEA_YA_CONCILIADA' });

    const matches = await prisma.matchConciliacion.findMany({
      where: { organizationId: tenantA },
    });
    expect(matches).toHaveLength(1);
    expect(matches[0]!.id).toBe(original.id);
    expect(matches[0]!.movimientoBancarioId).toBe(movimientoId);

    const segundoMov = await prisma.movimientoBancario.findUniqueOrThrow({
      where: { id: otroMovimiento },
    });
    expect(segundoMov.estado).toBe(EstadoMovimientoBancario.PENDIENTE);
  });

  // ==========================================================
  // 5.18 — REQ-CB-17 escenario 4: el match previo está ROTO ⇒ reemplazo
  // ==========================================================

  it('5.18 — confirmar contra una línea cuyo match previo está ROTO ⇒ lo borra y crea el nuevo, sin huérfanos', async () => {
    const { comprobanteId, movimientoId } = await escenarioSimple();
    const viejo = await service.crearMatch(tenantA, USER, {
      movimientoBancarioId: movimientoId,
      comprobanteId,
      orden: 1,
    });

    // El comprobante se edita: la línea de orden=1 cambia de monto → el
    // snapshot del match viejo deja de coincidir (vínculo ROTO).
    await prisma.lineaComprobante.updateMany({
      where: { comprobanteId, orden: 1 },
      data: { debito: new Prisma.Decimal('2100.00'), debitoBob: new Prisma.Decimal('2100.00') },
    });

    const nuevoMovimiento = await crearMovimiento(tenantA, cuentaBancariaA, importacionA, {
      dia: 10,
      monto: '2100.00',
    });

    const nuevo = await service.crearMatch(tenantA, USER, {
      movimientoBancarioId: nuevoMovimiento,
      comprobanteId,
      orden: 1,
    });

    // Un solo match vivo, el nuevo, con el snapshot ACTUALIZADO.
    const matches = await prisma.matchConciliacion.findMany({ where: { organizationId: tenantA } });
    expect(matches).toHaveLength(1);
    expect(matches[0]!.id).toBe(nuevo.id);
    expect(matches[0]!.id).not.toBe(viejo.id);
    expect(matches[0]!.snapshotMonto.toFixed(2)).toBe('2100.00');

    // El movimiento del match borrado vuelve a PENDIENTE: la invariante
    // `estado==='CONCILIADO' ⟺ existe MatchConciliacion` no admite huérfanos.
    const viejoMov = await prisma.movimientoBancario.findUniqueOrThrow({
      where: { id: movimientoId },
    });
    expect(viejoMov.estado).toBe(EstadoMovimientoBancario.PENDIENTE);

    const nuevoMov = await prisma.movimientoBancario.findUniqueOrThrow({
      where: { id: nuevoMovimiento },
    });
    expect(nuevoMov.estado).toBe(EstadoMovimientoBancario.CONCILIADO);
  });

  // ==========================================================
  // 5.20 — invariante estado === 'CONCILIADO' ⟺ existe MatchConciliacion
  // ==========================================================

  it('5.20 — invariante: tras crearMatch la columna estado es CONCILIADO y existe exactamente 1 match', async () => {
    const { comprobanteId, movimientoId } = await escenarioSimple();

    const antes = await prisma.movimientoBancario.findUniqueOrThrow({
      where: { id: movimientoId },
    });
    expect(antes.estado).toBe(EstadoMovimientoBancario.PENDIENTE);
    expect(
      await prisma.matchConciliacion.count({ where: { movimientoBancarioId: movimientoId } }),
    ).toBe(0);

    await service.crearMatch(tenantA, USER, {
      movimientoBancarioId: movimientoId,
      comprobanteId,
      orden: 1,
    });

    const despues = await prisma.movimientoBancario.findUniqueOrThrow({
      where: { id: movimientoId },
    });
    expect(despues.estado).toBe(EstadoMovimientoBancario.CONCILIADO);
    expect(
      await prisma.matchConciliacion.count({ where: { movimientoBancarioId: movimientoId } }),
    ).toBe(1);
  });

  // ==========================================================
  // 5.21 — REQ-CB-17 escenario 5: deshacer
  // ==========================================================

  it('5.21 — deshacer borra el match, devuelve el movimiento a PENDIENTE y NO toca el comprobante ni sus líneas', async () => {
    const { comprobanteId, movimientoId } = await escenarioSimple();
    const match = await service.crearMatch(tenantA, USER, {
      movimientoBancarioId: movimientoId,
      comprobanteId,
      orden: 1,
    });

    const comprobanteAntes = await prisma.comprobante.findUniqueOrThrow({
      where: { id: comprobanteId },
    });
    const lineasAntes = await prisma.lineaComprobante.findMany({
      where: { comprobanteId },
      orderBy: { orden: 'asc' },
    });

    await service.borrarMatch(tenantA, match.id);

    expect(await prisma.matchConciliacion.findUnique({ where: { id: match.id } })).toBeNull();
    const mov = await prisma.movimientoBancario.findUniqueOrThrow({ where: { id: movimientoId } });
    expect(mov.estado).toBe(EstadoMovimientoBancario.PENDIENTE);

    // Decisión 3 / REQ-CB-15: deshacer es exclusivo de la tabla de conciliación.
    const comprobanteDespues = await prisma.comprobante.findUniqueOrThrow({
      where: { id: comprobanteId },
    });
    expect(comprobanteDespues).toEqual(comprobanteAntes);
    const lineasDespues = await prisma.lineaComprobante.findMany({
      where: { comprobanteId },
      orderBy: { orden: 'asc' },
    });
    expect(lineasDespues).toEqual(lineasAntes);
  });

  it('5.21bis — deshacer un match inexistente ⇒ 404', async () => {
    await expect(
      service.borrarMatch(tenantA, '00000000-0000-0000-0000-000000000000'),
    ).rejects.toMatchObject({ code: 'CONCILIACION_MATCH_NO_ENCONTRADO' });
  });

  // ==========================================================
  // 5.23 — REQ-CB-13: aislamiento cross-tenant de MatchConciliacion
  // ==========================================================

  it('5.23 — deshacer un match de otro tenant ⇒ 404 y el match sigue vivo', async () => {
    const { comprobanteId, movimientoId } = await escenarioSimple();
    const match = await service.crearMatch(tenantA, USER, {
      movimientoBancarioId: movimientoId,
      comprobanteId,
      orden: 1,
    });

    await expect(service.borrarMatch(tenantB, match.id)).rejects.toMatchObject({
      code: 'CONCILIACION_MATCH_NO_ENCONTRADO',
    });
    expect(await prisma.matchConciliacion.findUnique({ where: { id: match.id } })).not.toBeNull();
  });

  it('5.23quater — cada tenant concilia su propia isla: el match de B no es alcanzable desde A', async () => {
    // Tenant B arma su propio par y lo concilia con SU tenantId.
    const importacionB = await crearImportacion(tenantB, cuentaBancariaB);
    const comprobanteB = await crearComprobante(tenantB, periodoB, cuentaBancoB, {
      dia: 10,
      numero: 'D2606-000001',
      lineas: [{ orden: 1, debito: '4200.00' }],
    });
    const movimientoB = await crearMovimiento(tenantB, cuentaBancariaB, importacionB, {
      dia: 10,
      monto: '4200.00',
    });

    const matchB = await service.crearMatch(tenantB, USER, {
      movimientoBancarioId: movimientoB,
      comprobanteId: comprobanteB,
      orden: 1,
    });
    expect(matchB.organizationId).toBe(tenantB);

    // A no lo puede deshacer ni ve su movimiento.
    await expect(service.borrarMatch(tenantA, matchB.id)).rejects.toMatchObject({
      code: 'CONCILIACION_MATCH_NO_ENCONTRADO',
    });
    await expect(
      service.crearMatch(tenantA, USER, {
        movimientoBancarioId: movimientoB,
        comprobanteId: comprobanteB,
        orden: 1,
      }),
    ).rejects.toMatchObject({ code: 'CONCILIACION_MOVIMIENTO_NO_ENCONTRADO' });

    expect(await prisma.matchConciliacion.count({ where: { organizationId: tenantB } })).toBe(1);
    expect(await prisma.matchConciliacion.count({ where: { organizationId: tenantA } })).toBe(0);
  });

  it('5.23bis — confirmar sobre un movimiento de otro tenant ⇒ 404, cero filas creadas', async () => {
    const { comprobanteId, movimientoId } = await escenarioSimple();

    await expect(
      service.crearMatch(tenantB, USER, {
        movimientoBancarioId: movimientoId,
        comprobanteId,
        orden: 1,
      }),
    ).rejects.toMatchObject({ code: 'CONCILIACION_MOVIMIENTO_NO_ENCONTRADO' });

    // Acotado a los tenants del test: un `count()` global haría depender el
    // resultado de lo que haya en la BD compartida (datos de dev, otra suite).
    expect(await matchesDeLosTenantsDelTest()).toBe(0);
  });

  it('5.23ter — confirmar contra una línea de OTRO tenant ⇒ la línea no resuelve, 422', async () => {
    const comprobanteB = await crearComprobante(tenantB, periodoB, cuentaBancoB, {
      dia: 10,
      numero: 'D2606-000001',
      lineas: [{ orden: 1, debito: '1500.00' }],
    });
    const movimientoA = await crearMovimiento(tenantA, cuentaBancariaA, importacionA, {
      dia: 10,
      monto: '1500.00',
    });

    await expect(
      service.crearMatch(tenantA, USER, {
        movimientoBancarioId: movimientoA,
        comprobanteId: comprobanteB,
        orden: 1,
      }),
    ).rejects.toMatchObject({
      code: 'CONCILIACION_LINEA_NO_CONCILIABLE',
      details: expect.objectContaining({ motivo: 'LINEA_INEXISTENTE' }),
    });
    expect(await matchesDeLosTenantsDelTest()).toBe(0);
  });

  // ==========================================================
  // Validación de la línea destino (REQ-CB-17)
  // ==========================================================

  it('confirmar contra una línea de OTRA cuenta del plan ⇒ 422 CUENTA_DISTINTA', async () => {
    const comprobanteId = await crearComprobante(tenantA, periodoA, cuentaBancoA, {
      dia: 10,
      numero: 'D2606-000001',
      lineas: [{ orden: 1, cuentaId: cuentaOtraA, debito: '1500.00' }],
    });
    const movimientoId = await crearMovimiento(tenantA, cuentaBancariaA, importacionA, {
      dia: 10,
      monto: '1500.00',
    });

    await expect(
      service.crearMatch(tenantA, USER, {
        movimientoBancarioId: movimientoId,
        comprobanteId,
        orden: 1,
      }),
    ).rejects.toMatchObject({
      code: 'CONCILIACION_LINEA_NO_CONCILIABLE',
      details: expect.objectContaining({ motivo: 'CUENTA_DISTINTA' }),
    });
  });

  it('confirmar contra una línea de un comprobante ANULADO ⇒ 422 COMPROBANTE_ANULADO', async () => {
    const comprobanteId = await crearComprobante(tenantA, periodoA, cuentaBancoA, {
      dia: 10,
      numero: 'D2606-000001',
      anulado: true,
      lineas: [{ orden: 1, debito: '1500.00' }],
    });
    const movimientoId = await crearMovimiento(tenantA, cuentaBancariaA, importacionA, {
      dia: 10,
      monto: '1500.00',
    });

    await expect(
      service.crearMatch(tenantA, USER, {
        movimientoBancarioId: movimientoId,
        comprobanteId,
        orden: 1,
      }),
    ).rejects.toMatchObject({
      code: 'CONCILIACION_LINEA_NO_CONCILIABLE',
      details: expect.objectContaining({ motivo: 'COMPROBANTE_ANULADO' }),
    });
  });

  it('confirmar contra una línea de un BORRADOR ⇒ 422 COMPROBANTE_NO_CONTABILIZADO', async () => {
    const comprobanteId = await crearComprobante(tenantA, periodoA, cuentaBancoA, {
      dia: 10,
      numero: null,
      estado: EstadoComprobante.BORRADOR,
      lineas: [{ orden: 1, debito: '1500.00' }],
    });
    const movimientoId = await crearMovimiento(tenantA, cuentaBancariaA, importacionA, {
      dia: 10,
      monto: '1500.00',
    });

    await expect(
      service.crearMatch(tenantA, USER, {
        movimientoBancarioId: movimientoId,
        comprobanteId,
        orden: 1,
      }),
    ).rejects.toMatchObject({
      code: 'CONCILIACION_LINEA_NO_CONCILIABLE',
      details: expect.objectContaining({ motivo: 'COMPROBANTE_NO_CONTABILIZADO' }),
    });
  });
});
