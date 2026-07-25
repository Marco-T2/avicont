import { randomUUID } from 'node:crypto';

import {
  ClaseCuenta,
  EstadoVerificacionExtracto,
  NaturalezaCuenta,
  PerfilExtracto,
  Prisma,
  PrismaClient,
} from '@prisma/client';
import type { EstadoMovimientoBancario, LadoBancario, Moneda } from '@prisma/client';

import type { PrismaService } from '@/common/prisma.service';

import { PrismaMovimientoBancarioRepository } from './prisma-movimiento-bancario.repository';

/**
 * Integration spec de `PrismaMovimientoBancarioRepository` contra Postgres
 * real: orden de presentación del workspace (REQ-CB-22) y queries del
 * verificador cross-cuenta (REQ-VMB-01..05/08/09/11/13).
 *
 * Todos los conteos van acotados a los tenants que ESTE spec crea (§11.3:
 * corre contra la base de desarrollo).
 */
describe('PrismaMovimientoBancarioRepository — orden y verificador (integration)', () => {
  const SLUG_A = 'org-test-verif-a';
  const SLUG_B = 'org-test-verif-b';

  let prisma: PrismaClient;
  let repo: PrismaMovimientoBancarioRepository;
  let tenantA: string;
  let tenantB: string;
  let cuentaBancariaA: string;
  let cuentaBancariaB: string;
  let importacionA: string;
  let importacionB: string;

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();
    repo = new PrismaMovimientoBancarioRepository(prisma as unknown as PrismaService);
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

    const [cuentaA, cuentaB] = await Promise.all([
      crearCuenta(tenantA, '1.1.1.001'),
      crearCuenta(tenantB, '1.1.1.001'),
    ]);

    const cbA = await crearCuentaBancaria(tenantA, cuentaA.id, 'Cuenta A');
    const cbB = await crearCuentaBancaria(tenantB, cuentaB.id, 'Cuenta B');
    cuentaBancariaA = cbA.id;
    cuentaBancariaB = cbB.id;

    importacionA = (await crearImportacion(tenantA, cuentaBancariaA)).id;
    importacionB = (await crearImportacion(tenantB, cuentaBancariaB)).id;
  });

  async function cleanup() {
    const orgs = await prisma.organization.findMany({
      where: { slug: { in: [SLUG_A, SLUG_B] } },
      select: { id: true },
    });
    const orgIds = orgs.map((o) => o.id);
    if (orgIds.length > 0) {
      await prisma.movimientoBancario.deleteMany({ where: { organizationId: { in: orgIds } } });
      await prisma.importacionExtracto.deleteMany({ where: { organizationId: { in: orgIds } } });
      await prisma.cuentaBancaria.deleteMany({ where: { organizationId: { in: orgIds } } });
      await prisma.cuenta.deleteMany({ where: { organizationId: { in: orgIds } } });
    }
    await prisma.organization.deleteMany({ where: { slug: { in: [SLUG_A, SLUG_B] } } });
  }

  async function crearCuenta(organizationId: string, codigoInterno: string) {
    return prisma.cuenta.create({
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
  }

  async function crearCuentaBancaria(
    organizationId: string,
    cuentaId: string,
    alias: string,
    moneda: Moneda = 'BOB',
  ) {
    return prisma.cuentaBancaria.create({
      data: {
        organizationId,
        cuentaId,
        alias,
        perfilExtracto: PerfilExtracto.BANCOSOL_XLSX,
        numeroCuenta: null,
        moneda,
      },
    });
  }

  async function crearImportacion(tenantId: string, cuentaBancariaId: string) {
    return prisma.importacionExtracto.create({
      data: {
        organizationId: tenantId,
        cuentaBancariaId,
        nombreArchivo: 'extracto.xlsx',
        sha256Archivo: randomUUID().repeat(2).slice(0, 64),
        tamanioBytes: 1000,
        perfilExtracto: PerfilExtracto.BANCOSOL_XLSX,
        fechaDesde: new Date('2026-06-01T00:00:00Z'),
        fechaHasta: new Date('2026-06-30T00:00:00Z'),
        coberturaDeclarada: false,
        saldoInicial: null,
        saldoFinal: null,
        estadoVerificacion: EstadoVerificacionExtracto.SIN_VERIFICAR,
        diferencia: null,
        filasLeidas: 0,
        movimientosNuevos: 0,
        movimientosDuplicados: 0,
        importadoPorUserId: 'user-1',
      },
    });
  }

  interface MovimientoOpts {
    id?: string;
    tenantId?: string;
    cuentaBancariaId?: string;
    importacionId?: string;
    fecha: string;
    hora?: string | null;
    monto?: string;
    tipo?: LadoBancario;
    moneda?: Moneda;
    descripcion?: string;
    descripcionNormalizada?: string;
    saldo?: string | null;
    ordenFisico?: number | null;
    estado?: EstadoMovimientoBancario;
  }

  let seq = 0;

  async function crearMovimiento(opts: MovimientoOpts) {
    seq += 1;
    return prisma.movimientoBancario.create({
      data: {
        ...(opts.id !== undefined ? { id: opts.id } : {}),
        organizationId: opts.tenantId ?? tenantA,
        cuentaBancariaId: opts.cuentaBancariaId ?? cuentaBancariaA,
        importacionId:
          opts.importacionId ??
          ((opts.tenantId ?? tenantA) === tenantA ? importacionA : importacionB),
        fecha: new Date(`${opts.fecha}T00:00:00.000Z`),
        hora: opts.hora ?? null,
        monto: new Prisma.Decimal(opts.monto ?? '100.00'),
        tipo: opts.tipo ?? 'DEBITO',
        moneda: opts.moneda ?? 'BOB',
        descripcion: opts.descripcion ?? `Movimiento ${seq}`,
        descripcionNormalizada: opts.descripcionNormalizada ?? `MOVIMIENTO ${seq}`,
        referencia: null,
        saldo:
          opts.saldo === undefined || opts.saldo === null ? null : new Prisma.Decimal(opts.saldo),
        contraparteNombre: null,
        contraparteDocumento: null,
        datosOriginales: {},
        ordinalDia: 0,
        ordenFisico: opts.ordenFisico ?? null,
        hashDedup: randomUUID(),
        ...(opts.estado !== undefined ? { estado: opts.estado } : {}),
      },
    });
  }

  /** ids fijos cuyo orden lexicográfico es DESCENDENTE — desempate adversarial. */
  const ID_ALTO = '99999999-0000-4000-8000-000000000001';
  const ID_MEDIO = '55555555-0000-4000-8000-000000000002';
  const ID_BAJO = '11111111-0000-4000-8000-000000000003';

  const RANGO_JUNIO = {
    fechaDesde: new Date('2026-06-01T00:00:00.000Z'),
    fechaHasta: new Date('2026-06-30T00:00:00.000Z'),
  };

  // ============================================================
  // REQ-CB-22 — el workspace adopta el orden de presentación
  // ============================================================

  describe('listarPorCuentaBancariaEnRango — orden de presentación (REQ-CB-22)', () => {
    it('horas 09:15/14:02/21:40 con ids que NO siguen ese orden salen cronológicas', async () => {
      // ids elegidos para que el orden por UUID sea EXACTAMENTE el inverso:
      // si el desempate siguiera siendo el id, este test rompe.
      await crearMovimiento({ id: ID_BAJO, fecha: '2026-06-10', hora: '21:40:00' });
      await crearMovimiento({ id: ID_MEDIO, fecha: '2026-06-10', hora: '14:02:00' });
      await crearMovimiento({ id: ID_ALTO, fecha: '2026-06-10', hora: '09:15:00' });

      const movimientos = await repo.listarPorCuentaBancariaEnRango(
        tenantA,
        cuentaBancariaA,
        RANGO_JUNIO,
      );

      expect(movimientos.map((m) => m.hora)).toEqual(['09:15:00', '14:02:00', '21:40:00']);
    });

    it('hora null se presenta al FINAL de su día (NULLS LAST)', async () => {
      await crearMovimiento({ id: ID_BAJO, fecha: '2026-06-10', hora: null });
      await crearMovimiento({ id: ID_ALTO, fecha: '2026-06-10', hora: '10:00:00' });

      const movimientos = await repo.listarPorCuentaBancariaEnRango(
        tenantA,
        cuentaBancariaA,
        RANGO_JUNIO,
      );

      expect(movimientos.map((m) => m.hora)).toEqual(['10:00:00', null]);
    });

    it('sin hora (perfil Unión), ordenFisico desempata dentro del día (REQ-CB-21 escenario 4)', async () => {
      await crearMovimiento({ id: ID_BAJO, fecha: '2026-06-10', hora: null, ordenFisico: 2 });
      await crearMovimiento({ id: ID_MEDIO, fecha: '2026-06-10', hora: null, ordenFisico: 0 });
      await crearMovimiento({ id: ID_ALTO, fecha: '2026-06-10', hora: null, ordenFisico: 1 });

      const movimientos = await repo.listarPorCuentaBancariaEnRango(
        tenantA,
        cuentaBancariaA,
        RANGO_JUNIO,
      );

      expect(movimientos.map((m) => m.ordenFisico)).toEqual([0, 1, 2]);
    });

    it('ordenFisico null (importado pre-change) degrada a fecha, hora, id — sin error', async () => {
      await crearMovimiento({ id: ID_ALTO, fecha: '2026-06-10', hora: null, ordenFisico: null });
      await crearMovimiento({ id: ID_BAJO, fecha: '2026-06-10', hora: null, ordenFisico: null });
      // Con ordenFisico, gana posición ANTES que los null (NULLS LAST)
      await crearMovimiento({ id: ID_MEDIO, fecha: '2026-06-10', hora: null, ordenFisico: 0 });

      const movimientos = await repo.listarPorCuentaBancariaEnRango(
        tenantA,
        cuentaBancariaA,
        RANGO_JUNIO,
      );

      expect(movimientos.map((m) => m.id)).toEqual([ID_MEDIO, ID_BAJO, ID_ALTO]);
    });

    it('la fecha manda sobre todo: días distintos no se mezclan por hora ni ordenFisico', async () => {
      await crearMovimiento({ id: ID_BAJO, fecha: '2026-06-11', hora: '01:00:00', ordenFisico: 0 });
      await crearMovimiento({ id: ID_ALTO, fecha: '2026-06-10', hora: '23:00:00', ordenFisico: 5 });

      const movimientos = await repo.listarPorCuentaBancariaEnRango(
        tenantA,
        cuentaBancariaA,
        RANGO_JUNIO,
      );

      expect(movimientos.map((m) => m.id)).toEqual([ID_ALTO, ID_BAJO]);
    });
  });

  // ============================================================
  // Verificador cross-cuenta (REQ-VMB-01..05/07/08/09/11/13)
  // ============================================================

  async function crearSegundaCuentaBancariaA() {
    const cuenta2 = await crearCuenta(tenantA, '1.1.1.002');
    const cb2 = await crearCuentaBancaria(tenantA, cuenta2.id, 'Cuenta A2');
    const imp2 = await crearImportacion(tenantA, cb2.id);
    return { cuentaBancariaId: cb2.id, importacionId: imp2.id };
  }

  async function crearMatch(tenantId: string, movimientoBancarioId: string) {
    return prisma.matchConciliacion.create({
      data: {
        organizationId: tenantId,
        movimientoBancarioId,
        comprobanteId: randomUUID(),
        orden: 1,
        snapshotCuentaId: randomUUID(),
        snapshotMonto: new Prisma.Decimal('100.00'),
        snapshotTipo: 'DEBITO',
        snapshotMoneda: 'BOB',
        snapshotFecha: new Date('2026-06-10T00:00:00.000Z'),
        confianzaSugerida: null,
        conciliadoPorUserId: 'user-1',
      },
    });
  }

  describe('listarCrossCuenta / contarCrossCuenta (REQ-VMB-01/03/04/05/13)', () => {
    it('un solo request trae movimientos de TODAS las cuentas del tenant y de NINGÚN otro tenant', async () => {
      const cb2 = await crearSegundaCuentaBancariaA();
      const movA = await crearMovimiento({ fecha: '2026-06-10' });
      const movA2 = await crearMovimiento({
        fecha: '2026-06-11',
        cuentaBancariaId: cb2.cuentaBancariaId,
        importacionId: cb2.importacionId,
      });
      await crearMovimiento({ fecha: '2026-06-10', tenantId: tenantB });

      const pagina = await repo.listarCrossCuenta(tenantA, RANGO_JUNIO, { skip: 0, take: 50 });
      const total = await repo.contarCrossCuenta(tenantA, RANGO_JUNIO);

      expect(pagina.map((m) => m.id)).toEqual([movA.id, movA2.id]);
      expect(new Set(pagina.map((m) => m.cuentaBancariaId))).toEqual(
        new Set([cuentaBancariaA, cb2.cuentaBancariaId]),
      );
      expect(total).toBe(2);
    });

    it('orden cross-cuenta: fecha, hora NULLS LAST, ordenFisico NULLS LAST, id — ids adversariales', async () => {
      await crearMovimiento({ id: ID_BAJO, fecha: '2026-06-10', hora: null, ordenFisico: null });
      await crearMovimiento({ id: ID_MEDIO, fecha: '2026-06-10', hora: null, ordenFisico: 0 });
      await crearMovimiento({ id: ID_ALTO, fecha: '2026-06-10', hora: '09:00:00' });

      const pagina = await repo.listarCrossCuenta(tenantA, RANGO_JUNIO, { skip: 0, take: 50 });

      // hora manda (09:00 primero), luego ordenFisico 0, luego el null total.
      // El orden por id sería exactamente el inverso.
      expect(pagina.map((m) => m.id)).toEqual([ID_ALTO, ID_MEDIO, ID_BAJO]);
    });

    it('determinismo del offset: 2 páginas consecutivas no duplican ni pierden filas ante empates totales', async () => {
      // 12 filas con fecha/hora/ordenFisico IDÉNTICOS: el único desempate es id.
      // Sin el `id ASC` final, Postgres puede devolver cualquier orden y el
      // offset duplica o pierde filas entre páginas.
      const ids: string[] = [];
      for (let i = 0; i < 12; i++) {
        const mov = await crearMovimiento({ fecha: '2026-06-10', hora: null, ordenFisico: null });
        ids.push(mov.id);
      }

      const pagina1 = await repo.listarCrossCuenta(tenantA, RANGO_JUNIO, { skip: 0, take: 6 });
      const pagina2 = await repo.listarCrossCuenta(tenantA, RANGO_JUNIO, { skip: 6, take: 6 });

      const vistos = [...pagina1, ...pagina2].map((m) => m.id);
      expect(vistos).toHaveLength(12);
      expect(new Set(vistos)).toEqual(new Set(ids));
    });

    it('filtros combinados: cuenta + rango de monto + glosa normalizada, y contar coincide', async () => {
      const cb2 = await crearSegundaCuentaBancariaA();
      const esperado = await crearMovimiento({
        fecha: '2026-06-10',
        monto: '250.00',
        descripcionNormalizada: 'DEPOSITO EN EFECTIVO',
      });
      await crearMovimiento({
        fecha: '2026-06-10',
        monto: '250.00',
        descripcionNormalizada: 'PAGO QR',
      });
      await crearMovimiento({
        fecha: '2026-06-10',
        monto: '750.00',
        descripcionNormalizada: 'DEPOSITO GRANDE',
      });
      await crearMovimiento({
        fecha: '2026-06-10',
        monto: '250.00',
        descripcionNormalizada: 'DEPOSITO OTRA CUENTA',
        cuentaBancariaId: cb2.cuentaBancariaId,
        importacionId: cb2.importacionId,
      });

      const filtros = {
        ...RANGO_JUNIO,
        cuentaBancariaId: cuentaBancariaA,
        montoDesde: new Prisma.Decimal('100.00'),
        montoHasta: new Prisma.Decimal('500.00'),
        glosaNormalizada: 'DEPOSITO',
      };
      const pagina = await repo.listarCrossCuenta(tenantA, filtros, { skip: 0, take: 50 });
      const total = await repo.contarCrossCuenta(tenantA, filtros);

      expect(pagina.map((m) => m.id)).toEqual([esperado.id]);
      expect(total).toBe(1);
    });

    it('filtro estado: solo la columna cacheada pedida', async () => {
      await crearMovimiento({ fecha: '2026-06-10', estado: 'PENDIENTE' });
      const ignorado = await crearMovimiento({ fecha: '2026-06-11', estado: 'IGNORADO' });

      const filtros = { ...RANGO_JUNIO, estado: 'IGNORADO' as const };
      const pagina = await repo.listarCrossCuenta(tenantA, filtros, { skip: 0, take: 50 });

      expect(pagina.map((m) => m.id)).toEqual([ignorado.id]);
      expect(await repo.contarCrossCuenta(tenantA, filtros)).toBe(1);
    });

    it('cuentaBancariaId de OTRO tenant ⇒ vacío con total 0, sin revelar la cuenta (REQ-VMB-13)', async () => {
      await crearMovimiento({ fecha: '2026-06-10', tenantId: tenantB });

      const filtros = { ...RANGO_JUNIO, cuentaBancariaId: cuentaBancariaB };
      expect(await repo.listarCrossCuenta(tenantA, filtros, { skip: 0, take: 50 })).toEqual([]);
      expect(await repo.contarCrossCuenta(tenantA, filtros)).toBe(0);
    });
  });

  describe('totalesPorMoneda (REQ-VMB-11/13)', () => {
    it('agrupa por moneda y tipo con total y cantidad propios, sin mezclar monedas ni tenants', async () => {
      await crearMovimiento({
        fecha: '2026-06-10',
        monto: '100.00',
        tipo: 'DEBITO',
        moneda: 'BOB',
      });
      await crearMovimiento({
        fecha: '2026-06-11',
        monto: '200.50',
        tipo: 'DEBITO',
        moneda: 'BOB',
      });
      await crearMovimiento({
        fecha: '2026-06-12',
        monto: '50.00',
        tipo: 'CREDITO',
        moneda: 'BOB',
      });
      await crearMovimiento({ fecha: '2026-06-13', monto: '10.00', tipo: 'DEBITO', moneda: 'USD' });
      await crearMovimiento({
        fecha: '2026-06-10',
        monto: '999.00',
        tipo: 'DEBITO',
        moneda: 'USD',
        tenantId: tenantB,
      });

      const totales = await repo.totalesPorMoneda(tenantA, RANGO_JUNIO);

      const clave = (moneda: string, tipo: string) =>
        totales.find((t) => t.moneda === moneda && t.tipo === tipo);
      expect(totales).toHaveLength(3);
      expect(clave('BOB', 'DEBITO')?.total.toFixed(2)).toBe('300.50');
      expect(clave('BOB', 'DEBITO')?.cantidad).toBe(2);
      expect(clave('BOB', 'CREDITO')?.total.toFixed(2)).toBe('50.00');
      expect(clave('BOB', 'CREDITO')?.cantidad).toBe(1);
      expect(clave('USD', 'DEBITO')?.total.toFixed(2)).toBe('10.00');
      expect(clave('USD', 'DEBITO')?.cantidad).toBe(1);
    });

    it('respeta los filtros del listado (mismo where, sin drift)', async () => {
      await crearMovimiento({
        fecha: '2026-06-10',
        monto: '100.00',
        descripcionNormalizada: 'DEPOSITO EN EFECTIVO',
      });
      await crearMovimiento({
        fecha: '2026-06-10',
        monto: '900.00',
        descripcionNormalizada: 'PAGO QR',
      });

      const totales = await repo.totalesPorMoneda(tenantA, {
        ...RANGO_JUNIO,
        glosaNormalizada: 'DEPOSITO',
      });

      expect(totales).toHaveLength(1);
      expect(totales[0]!.total.toFixed(2)).toBe('100.00');
      expect(totales[0]!.cantidad).toBe(1);
    });
  });

  describe('listarIdsConMatch (REQ-VMB-07/13)', () => {
    it('solo ids de movimientos CON match dentro del rango filtrado, del tenant', async () => {
      const conMatch = await crearMovimiento({ fecha: '2026-06-10' });
      await crearMatch(tenantA, conMatch.id);
      await crearMovimiento({ fecha: '2026-06-11' }); // sin match
      const fueraDeRango = await crearMovimiento({ fecha: '2026-07-15' });
      await crearMatch(tenantA, fueraDeRango.id);
      const ajeno = await crearMovimiento({ fecha: '2026-06-10', tenantId: tenantB });
      await crearMatch(tenantB, ajeno.id);

      const ids = await repo.listarIdsConMatch(tenantA, RANGO_JUNIO);

      expect(ids).toEqual([{ id: conMatch.id }]);
    });
  });

  describe('listarPorIds (franja de rotos, REQ-VMB-07)', () => {
    it('trae solo ids del tenant, en orden de presentación; lista vacía ⇒ []', async () => {
      const propio = await crearMovimiento({ fecha: '2026-06-11' });
      const propio2 = await crearMovimiento({ fecha: '2026-06-10' });
      const ajeno = await crearMovimiento({ fecha: '2026-06-10', tenantId: tenantB });

      const resultado = await repo.listarPorIds(tenantA, [propio.id, propio2.id, ajeno.id]);

      expect(resultado.map((m) => m.id)).toEqual([propio2.id, propio.id]);
      expect(await repo.listarPorIds(tenantA, [])).toEqual([]);
    });
  });

  describe('saldosVigentes (REQ-VMB-08/09/13)', () => {
    const CORTE_JUNIO = new Date('2026-06-30T00:00:00.000Z');

    it('empate intra-día con hora null: elige la MISMA fila que cierra el listado (DESC NULLS FIRST)', async () => {
      await crearMovimiento({ fecha: '2026-06-05', hora: '08:00:00', saldo: '999.00' });
      await crearMovimiento({
        id: ID_ALTO,
        fecha: '2026-06-10',
        hora: '09:00:00',
        saldo: '100.00',
      });
      // hora null cierra el día en presentación (NULLS LAST) ⇒ su saldo es el vigente
      await crearMovimiento({ id: ID_BAJO, fecha: '2026-06-10', hora: null, saldo: '300.00' });

      const saldos = await repo.saldosVigentes(tenantA, CORTE_JUNIO);

      expect(saldos).toHaveLength(1);
      expect(saldos[0]!.cuentaBancariaId).toBe(cuentaBancariaA);
      expect(saldos[0]!.fecha.toISOString().slice(0, 10)).toBe('2026-06-10');
      expect(saldos[0]!.saldo?.toFixed(2)).toBe('300.00');
    });

    it('empate intra-día sin hora: gana el ordenFisico más alto (cierra el listado)', async () => {
      await crearMovimiento({ fecha: '2026-06-10', hora: null, ordenFisico: 0, saldo: '10.00' });
      await crearMovimiento({ fecha: '2026-06-10', hora: null, ordenFisico: 2, saldo: '30.00' });
      await crearMovimiento({ fecha: '2026-06-10', hora: null, ordenFisico: 1, saldo: '20.00' });

      const saldos = await repo.saldosVigentes(tenantA, CORTE_JUNIO);

      expect(saldos).toHaveLength(1);
      expect(saldos[0]!.saldo?.toFixed(2)).toBe('30.00');
    });

    it('saldo null honesto: sin fallback a una fila anterior con saldo (REQ-VMB-09)', async () => {
      await crearMovimiento({ fecha: '2026-06-10', saldo: '500.00' });
      await crearMovimiento({ fecha: '2026-06-12', saldo: null });

      const saldos = await repo.saldosVigentes(tenantA, CORTE_JUNIO);

      expect(saldos).toHaveLength(1);
      expect(saldos[0]!.fecha.toISOString().slice(0, 10)).toBe('2026-06-12');
      expect(saldos[0]!.saldo).toBeNull();
    });

    it('el corte excluye movimientos posteriores a `hasta`', async () => {
      await crearMovimiento({ fecha: '2026-06-10', saldo: '100.00' });
      await crearMovimiento({ fecha: '2026-07-05', saldo: '900.00' });

      const saldos = await repo.saldosVigentes(tenantA, CORTE_JUNIO);

      expect(saldos).toHaveLength(1);
      expect(saldos[0]!.fecha.toISOString().slice(0, 10)).toBe('2026-06-10');
      expect(saldos[0]!.saldo?.toFixed(2)).toBe('100.00');
    });

    it('multi-tenant (Anti-31): solo cuentas del tenant; una cuenta sin movimientos no produce fila', async () => {
      await crearSegundaCuentaBancariaA(); // sin movimientos: el merge null/null lo hace el service
      await crearMovimiento({ fecha: '2026-06-10', saldo: '100.00' });
      await crearMovimiento({ fecha: '2026-06-10', saldo: '777.00', tenantId: tenantB });

      const saldos = await repo.saldosVigentes(tenantA, CORTE_JUNIO);

      expect(saldos).toHaveLength(1);
      expect(saldos[0]!.cuentaBancariaId).toBe(cuentaBancariaA);
    });
  });
});
