import {
  EstadoComprobante,
  GestionFiscalStatus,
  Moneda,
  PeriodoFiscalStatus,
  Prisma,
  PrismaClient,
  TipoComprobante,
} from '@prisma/client';

import { PrismaComprobanteRepository } from './prisma-comprobante.repository';

/**
 * Integration spec del flag de anulación (task 2.1 — comprobantes-anulacion-refactor).
 * Migrado a task 6.2: marcarAnulado() renombrado a anular() con shape AnularData.
 *
 * Valida el contrato del adapter:
 *   - anular() persiste anulado=true, fechaAnulacion, anuladoPorUserId, motivoAnulacion.
 *   - El estado permanece CONTABILIZADO (el flag es ortogonal al estado).
 *   - findById() devuelve el flag anulado=true para verificación posterior al servicio.
 *   - Solo afecta el comprobante indicado; un comprobante hermano queda sin tocar.
 *
 * Requiere Postgres corriendo en DATABASE_URL. Corre con:
 *   DATABASE_URL=... pnpm exec jest src/comprobantes/adapters/prisma-comprobante-anulacion
 */
describe('PrismaComprobanteRepository — anular() / flag anulado (integration vs Postgres)', () => {
  const SLUG = 'org-test-anulacion-flag';

  let prisma: PrismaClient;
  let repo: PrismaComprobanteRepository;
  let tenantId: string;
  let periodoId: string;

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();
    // PrismaComprobanteRepository usa PrismaService, pero acepta PrismaClient
    // sin problema porque comparten el mismo contrato $transaction / delegate.
    repo = new PrismaComprobanteRepository(prisma as never);
  });

  afterAll(async () => {
    await prisma.organization.deleteMany({ where: { slug: SLUG } });
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.organization.deleteMany({ where: { slug: SLUG } });

    const org = await prisma.organization.create({
      data: { slug: SLUG, name: 'Org Test Anulacion Flag' },
    });
    tenantId = org.id;

    const gestion = await prisma.gestionFiscal.create({
      data: {
        organizationId: tenantId,
        year: 2026,
        mesInicio: 4,
        status: GestionFiscalStatus.ABIERTA,
      },
    });

    const periodo = await prisma.periodoFiscal.create({
      data: {
        organizationId: tenantId,
        gestionId: gestion.id,
        year: 2026,
        month: 4,
        ordenEnGestion: 4,
        status: PeriodoFiscalStatus.ABIERTO,
      },
    });
    periodoId = periodo.id;
  });

  async function crearContabilizado(numero: string) {
    return prisma.comprobante.create({
      data: {
        organizationId: tenantId,
        tipo: TipoComprobante.DIARIO,
        numero,
        estado: EstadoComprobante.CONTABILIZADO,
        fechaContable: new Date(Date.UTC(2026, 3, 15)),
        periodoFiscalId: periodoId,
        glosa: 'Comprobante de prueba',
        monedaPrincipal: Moneda.BOB,
        totalDebitoBob: new Prisma.Decimal('1000.00'),
        totalCreditoBob: new Prisma.Decimal('1000.00'),
        createdByUserId: 'user-test',
      },
    });
  }

  it('persiste anulado=true con metadatos y preserva estado CONTABILIZADO', async () => {
    const original = await crearContabilizado('D2604-000001');
    const fechaAnulacion = new Date(Date.UTC(2026, 3, 22, 14, 30, 0));

    const result = await repo.anular(tenantId, original.id, {
      fechaAnulacion,
      anuladoPorUserId: 'user-auditor',
      motivoAnulacion: 'Error en la glosa del comprobante original',
    });

    // El flag anulado debe estar activado.
    expect(result.anulado).toBe(true);
    // Los metadatos de anulación deben persistirse.
    expect(result.fechaAnulacion).toEqual(fechaAnulacion);
    expect(result.anuladoPorUserId).toBe('user-auditor');
    expect(result.motivoAnulacion).toBe('Error en la glosa del comprobante original');
    // El estado es ortogonal al flag: permanece CONTABILIZADO (§4.7 CLAUDE.md).
    expect(result.estado).toBe(EstadoComprobante.CONTABILIZADO);
    // El número correlativo no cambia (§4.9 CLAUDE.md).
    expect(result.numero).toBe('D2604-000001');
  });

  it('findById() devuelve el flag anulado=true tras la anulación', async () => {
    const original = await crearContabilizado('D2604-000002');

    await repo.anular(tenantId, original.id, {
      fechaAnulacion: new Date(),
      anuladoPorUserId: 'user-test',
      motivoAnulacion: 'Motivo de prueba suficientemente largo',
    });

    const found = await repo.findById(tenantId, original.id);
    expect(found).not.toBeNull();
    expect(found!.anulado).toBe(true);
  });

  it('no afecta a un comprobante hermano en el mismo período', async () => {
    const target = await crearContabilizado('D2604-000003');
    const hermano = await crearContabilizado('D2604-000004');

    await repo.anular(tenantId, target.id, {
      fechaAnulacion: new Date(),
      anuladoPorUserId: 'user-test',
      motivoAnulacion: 'Anulación selectiva del target únicamente',
    });

    const hermanoPostAnulacion = await repo.findById(tenantId, hermano.id);
    expect(hermanoPostAnulacion!.anulado).toBe(false);
  });
});
