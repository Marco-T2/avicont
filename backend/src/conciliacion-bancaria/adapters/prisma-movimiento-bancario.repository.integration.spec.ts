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
          opts.importacionId ?? ((opts.tenantId ?? tenantA) === tenantA ? importacionA : importacionB),
        fecha: new Date(`${opts.fecha}T00:00:00.000Z`),
        hora: opts.hora ?? null,
        monto: new Prisma.Decimal(opts.monto ?? '100.00'),
        tipo: opts.tipo ?? 'DEBITO',
        moneda: opts.moneda ?? 'BOB',
        descripcion: opts.descripcion ?? `Movimiento ${seq}`,
        descripcionNormalizada: opts.descripcionNormalizada ?? `MOVIMIENTO ${seq}`,
        referencia: null,
        saldo: opts.saldo === undefined || opts.saldo === null ? null : new Prisma.Decimal(opts.saldo),
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
});
