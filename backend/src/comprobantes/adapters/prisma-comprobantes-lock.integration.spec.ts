import {
  EstadoComprobante,
  GestionFiscalStatus,
  Moneda,
  PeriodoFiscalStatus,
  Prisma,
  PrismaClient,
  TipoComprobante,
} from '@prisma/client';

import { PrismaComprobantesLockAdapter } from './prisma-comprobantes-lock.adapter';

/**
 * Integration spec del `PrismaComprobantesLockAdapter` contra Postgres real.
 * Valida end-to-end el contrato que `PeriodosFiscalesModule` consume:
 *   - `bloquearPorPeriodo` mueve CONTABILIZADO → BLOQUEADO y devuelve el count.
 *   - `desbloquearPorPeriodo` hace la reversa.
 *   - `contarBorradoresEnPeriodo` cuenta sólo los BORRADOR del período dado.
 *   - `obtenerResumenEnPeriodo` agrega contadores + totales + lista de borradores.
 *
 * Fixture mínima: 1 org, 1 gestión, 2 períodos (para chequear que las queries
 * filtran por periodoFiscalId y no afectan al período hermano). Sin cuentas:
 * los comprobantes se insertan sin líneas — el port no depende del detalle.
 */
describe('PrismaComprobantesLockAdapter — integration vs Postgres', () => {
  const SLUG = 'org-test-lock-adapter';

  let prisma: PrismaClient;
  let adapter: PrismaComprobantesLockAdapter;
  let tenantId: string;
  let periodoA: string;
  let periodoB: string;

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();
    adapter = new PrismaComprobantesLockAdapter();
  });

  afterAll(async () => {
    await prisma.organization.deleteMany({ where: { slug: SLUG } });
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.organization.deleteMany({ where: { slug: SLUG } });

    const org = await prisma.organization.create({
      data: { slug: SLUG, name: 'Org Test Lock Adapter' },
    });
    tenantId = org.id;

    const gestion = await prisma.gestionFiscal.create({
      data: {
        organizationId: tenantId,
        year: 2026,
        mesInicio: 1,
        status: GestionFiscalStatus.ABIERTA,
      },
    });
    const [a, b] = await Promise.all([
      prisma.periodoFiscal.create({
        data: {
          organizationId: tenantId,
          gestionId: gestion.id,
          year: 2026,
          month: 4,
          ordenEnGestion: 4,
          status: PeriodoFiscalStatus.ABIERTO,
        },
      }),
      prisma.periodoFiscal.create({
        data: {
          organizationId: tenantId,
          gestionId: gestion.id,
          year: 2026,
          month: 5,
          ordenEnGestion: 5,
          status: PeriodoFiscalStatus.ABIERTO,
        },
      }),
    ]);
    periodoA = a.id;
    periodoB = b.id;
  });

  async function crearComprobante(data: {
    estado: EstadoComprobante;
    periodoFiscalId: string;
    numero?: string | null;
    totalBob?: string;
    glosa?: string;
    fechaContable?: Date;
  }) {
    return prisma.comprobante.create({
      data: {
        organizationId: tenantId,
        tipo: TipoComprobante.DIARIO,
        numero: data.numero ?? null,
        estado: data.estado,
        fechaContable: data.fechaContable ?? new Date(Date.UTC(2026, 3, 22)),
        periodoFiscalId: data.periodoFiscalId,
        glosa: data.glosa ?? 'Comprobante de prueba',
        monedaPrincipal: Moneda.BOB,
        totalDebitoBob: new Prisma.Decimal(data.totalBob ?? '0'),
        totalCreditoBob: new Prisma.Decimal(data.totalBob ?? '0'),
        createdByUserId: 'user-test',
      },
    });
  }

  describe('bloquearPorPeriodo', () => {
    it('mueve CONTABILIZADO → BLOQUEADO sólo del período dado', async () => {
      await crearComprobante({
        estado: EstadoComprobante.CONTABILIZADO,
        periodoFiscalId: periodoA,
        numero: 'D2604-000001',
      });
      await crearComprobante({
        estado: EstadoComprobante.CONTABILIZADO,
        periodoFiscalId: periodoA,
        numero: 'D2604-000002',
      });
      // Otro período, no debe tocarse.
      await crearComprobante({
        estado: EstadoComprobante.CONTABILIZADO,
        periodoFiscalId: periodoB,
        numero: 'D2605-000001',
      });
      // BORRADOR en el mismo período, tampoco debe tocarse.
      await crearComprobante({
        estado: EstadoComprobante.BORRADOR,
        periodoFiscalId: periodoA,
      });

      const count = await prisma.$transaction((tx) => adapter.bloquearPorPeriodo(tx, periodoA));
      expect(count).toBe(2);

      const filas = await prisma.comprobante.findMany({
        where: { organizationId: tenantId },
        orderBy: { numero: 'asc' },
      });
      const estadoPor = Object.fromEntries(
        filas.map((c) => [c.numero ?? `__borrador_${c.id}`, c.estado]),
      );
      expect(estadoPor['D2604-000001']).toBe(EstadoComprobante.BLOQUEADO);
      expect(estadoPor['D2604-000002']).toBe(EstadoComprobante.BLOQUEADO);
      // El período B queda intacto.
      expect(estadoPor['D2605-000001']).toBe(EstadoComprobante.CONTABILIZADO);
      // El BORRADOR del período A tampoco cambia.
      const borradorKey = filas.find((c) => c.estado === EstadoComprobante.BORRADOR);
      expect(borradorKey?.estado).toBe(EstadoComprobante.BORRADOR);
    });

    // NOTE: comprobantes-anulacion-refactor — test "no afecta ANULADO (estado terminal distinto)"
    // removed. ANULADO is no longer a state in EstadoComprobante; anulados are now tracked via
    // the flag anulado=true. New integration test for flag-based anulados will be added in task 6.1.
  });

  describe('desbloquearPorPeriodo', () => {
    it('mueve BLOQUEADO → CONTABILIZADO sólo del período dado', async () => {
      await crearComprobante({
        estado: EstadoComprobante.BLOQUEADO,
        periodoFiscalId: periodoA,
        numero: 'D2604-000001',
      });
      await crearComprobante({
        estado: EstadoComprobante.BLOQUEADO,
        periodoFiscalId: periodoB,
        numero: 'D2605-000001',
      });

      const count = await prisma.$transaction((tx) => adapter.desbloquearPorPeriodo(tx, periodoA));
      expect(count).toBe(1);

      const a = await prisma.comprobante.findFirst({ where: { numero: 'D2604-000001' } });
      const b = await prisma.comprobante.findFirst({ where: { numero: 'D2605-000001' } });
      expect(a?.estado).toBe(EstadoComprobante.CONTABILIZADO);
      expect(b?.estado).toBe(EstadoComprobante.BLOQUEADO);
    });
  });

  describe('contarBorradoresEnPeriodo', () => {
    it('cuenta sólo BORRADOR del período, ignora otros estados y otros períodos', async () => {
      await crearComprobante({ estado: EstadoComprobante.BORRADOR, periodoFiscalId: periodoA });
      await crearComprobante({ estado: EstadoComprobante.BORRADOR, periodoFiscalId: periodoA });
      await crearComprobante({ estado: EstadoComprobante.BORRADOR, periodoFiscalId: periodoA });
      await crearComprobante({
        estado: EstadoComprobante.CONTABILIZADO,
        periodoFiscalId: periodoA,
        numero: 'D2604-000001',
      });
      await crearComprobante({ estado: EstadoComprobante.BORRADOR, periodoFiscalId: periodoB });

      const n = await prisma.$transaction((tx) => adapter.contarBorradoresEnPeriodo(tx, periodoA));
      expect(n).toBe(3);
    });
  });

  describe('obtenerResumenEnPeriodo', () => {
    it('devuelve contadores, totales y lista de borradores del período', async () => {
      await crearComprobante({
        estado: EstadoComprobante.CONTABILIZADO,
        periodoFiscalId: periodoA,
        numero: 'D2604-000001',
        totalBob: '1500.50',
      });
      await crearComprobante({
        estado: EstadoComprobante.CONTABILIZADO,
        periodoFiscalId: periodoA,
        numero: 'D2604-000002',
        totalBob: '2500.00',
      });
      // NOTE: comprobantes-anulacion-refactor — replaced ANULADO state fixture with
      // CONTABILIZADO+anulado=true fixture once the migration lands (task 6.1).
      // For now we remove this fixture to avoid using the dropped enum value.
      await crearComprobante({
        estado: EstadoComprobante.BORRADOR,
        periodoFiscalId: periodoA,
        glosa: 'Venta pendiente',
        totalBob: '300.00',
        fechaContable: new Date(Date.UTC(2026, 3, 10)),
      });

      const resumen = await prisma.$transaction((tx) =>
        adapter.obtenerResumenEnPeriodo(tx, periodoA),
      );

      expect(resumen.contabilizados).toBe(2);
      expect(resumen.borradores).toBe(1);
      // anulados = 0: flag-based count pending task 5.5
      expect(resumen.anulados).toBe(0);
      // Totales agregan sólo los CONTABILIZADO (§3 doc, §4.1 core).
      expect(resumen.totalDebeBob).toBe('4000.50');
      expect(resumen.totalHaberBob).toBe('4000.50');
      expect(resumen.borradoresList).toHaveLength(1);
      expect(resumen.borradoresList[0]).toMatchObject({
        glosa: 'Venta pendiente',
        fechaContable: '2026-04-10',
        totalBob: '300.00',
      });
    });

    it('período vacío: ceros y lista vacía', async () => {
      const resumen = await prisma.$transaction((tx) =>
        adapter.obtenerResumenEnPeriodo(tx, periodoA),
      );
      expect(resumen).toEqual({
        contabilizados: 0,
        borradores: 0,
        anulados: 0,
        totalDebeBob: '0.00',
        totalHaberBob: '0.00',
        borradoresList: [],
      });
    });
  });
});
