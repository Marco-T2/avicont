import {
  EstadoComprobante,
  GestionFiscalStatus,
  Moneda,
  PeriodoFiscalStatus,
  Prisma,
  PrismaClient,
  TipoComprobante,
} from '@prisma/client';

import type { PrismaService } from '@/common/prisma.service';

import { PrismaComprobanteRepository } from './prisma-comprobante.repository';

/**
 * Integration spec de la FK bidireccional entre un comprobante ANULADO y su
 * reversión AJUSTE. Valida que:
 *   - El `@unique([anulaAId])` del schema materializa la relación 1:1.
 *   - La back-ref `Comprobante.reversion` se resuelve desde Prisma sin
 *     necesidad de columna `anuladoPorId` en el original.
 *   - Crear un segundo AJUSTE con el mismo `anulaAId` falla (unicidad DB).
 *
 * Usa fixtures mínimas (org + gestion + periodo; sin cuentas, sin líneas).
 * Las líneas no son necesarias para validar la FK `anulaAId` — ese es un
 * test del schema, no del flujo completo de anulación.
 */
describe('PrismaComprobanteRepository — reversión FK (integration)', () => {
  const SLUG = 'org-test-reversion-fk';

  let prisma: PrismaClient;
  let repo: PrismaComprobanteRepository;
  let tenantId: string;
  let periodoFiscalId: string;

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();
    repo = new PrismaComprobanteRepository(prisma as unknown as PrismaService);
  });

  afterAll(async () => {
    await prisma.organization.deleteMany({ where: { slug: SLUG } });
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.organization.deleteMany({ where: { slug: SLUG } });

    const org = await prisma.organization.create({
      data: { slug: SLUG, name: 'Org Test Reversion FK' },
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
    periodoFiscalId = periodo.id;
  });

  async function crearOriginalContabilizado() {
    return prisma.comprobante.create({
      data: {
        organizationId: tenantId,
        tipo: TipoComprobante.DIARIO,
        numero: 'D2604-000001',
        estado: EstadoComprobante.CONTABILIZADO,
        fechaContable: new Date(Date.UTC(2026, 3, 22)),
        periodoFiscalId,
        glosa: 'Comprobante original a anular',
        monedaPrincipal: Moneda.BOB,
        createdByUserId: 'user-test',
      },
    });
  }

  it('una reversión creada con anulaAId se resuelve vía back-ref original.reversion', async () => {
    const original = await crearOriginalContabilizado();

    // Creamos la reversión con los mismos datos mínimos + anulaAId.
    const reversion = await prisma.comprobante.create({
      data: {
        organizationId: tenantId,
        tipo: TipoComprobante.AJUSTE,
        numero: 'J2604-000001',
        estado: EstadoComprobante.CONTABILIZADO,
        fechaContable: new Date(Date.UTC(2026, 3, 22)),
        periodoFiscalId,
        glosa: `Reversión de ${original.numero}: motivo de prueba`,
        monedaPrincipal: Moneda.BOB,
        createdByUserId: 'user-test',
        anulaAId: original.id,
      },
    });

    // Back-ref desde el original (gracias al @unique([anulaAId])).
    const originalConRef = await prisma.comprobante.findUnique({
      where: { id: original.id },
      include: { reversion: true, anulaA: true },
    });
    expect(originalConRef?.reversion?.id).toBe(reversion.id);
    expect(originalConRef?.reversion?.numero).toBe('J2604-000001');
    expect(originalConRef?.anulaA).toBeNull(); // el original no anula a nadie

    // FK explícita desde la reversión al original.
    const reversionConRef = await prisma.comprobante.findUnique({
      where: { id: reversion.id },
      include: { reversion: true, anulaA: true },
    });
    expect(reversionConRef?.anulaAId).toBe(original.id);
    expect(reversionConRef?.anulaA?.id).toBe(original.id);
    expect(reversionConRef?.reversion).toBeNull(); // la reversión no tiene reversión propia
  });

  it('no permite dos reversiones del mismo comprobante (@unique([anulaAId]))', async () => {
    const original = await crearOriginalContabilizado();

    await prisma.comprobante.create({
      data: {
        organizationId: tenantId,
        tipo: TipoComprobante.AJUSTE,
        numero: 'J2604-000001',
        estado: EstadoComprobante.CONTABILIZADO,
        fechaContable: new Date(Date.UTC(2026, 3, 22)),
        periodoFiscalId,
        glosa: `Reversión 1 de ${original.numero}`,
        monedaPrincipal: Moneda.BOB,
        createdByUserId: 'user-test',
        anulaAId: original.id,
      },
    });

    // Intento de crear un segundo AJUSTE anulando al mismo original.
    await expect(
      prisma.comprobante.create({
        data: {
          organizationId: tenantId,
          tipo: TipoComprobante.AJUSTE,
          numero: 'J2604-000002',
          estado: EstadoComprobante.CONTABILIZADO,
          fechaContable: new Date(Date.UTC(2026, 3, 22)),
          periodoFiscalId,
          glosa: `Reversión 2 (duplicada) de ${original.numero}`,
          monedaPrincipal: Moneda.BOB,
          createdByUserId: 'user-test',
          anulaAId: original.id,
        },
      }),
    ).rejects.toThrow();
  });

  it('crearReversion del adapter persiste la FK y marcarAnulado update metadata', async () => {
    const original = await crearOriginalContabilizado();
    const anuladoEn = new Date('2026-04-23T10:00:00Z');

    const reversion = await repo.crearReversion(tenantId, {
      tipo: TipoComprobante.AJUSTE,
      numero: 'J2604-000001',
      fechaContable: new Date(Date.UTC(2026, 3, 23)),
      periodoFiscalId,
      glosa: `Reversión de ${original.numero}: motivo completo`,
      monedaPrincipal: Moneda.BOB,
      totalDebitoBob: new Prisma.Decimal('0'),
      totalCreditoBob: new Prisma.Decimal('0'),
      createdByUserId: 'user-test',
      anulaAId: original.id,
      lineas: [],
    });

    const originalAnulado = await repo.marcarAnulado(tenantId, original.id, {
      anuladoEn,
      anuladoPorUserId: 'user-test',
      motivoAnulacion: 'motivo completo',
    });

    expect(reversion.anulaAId).toBe(original.id);
    expect(originalAnulado.estado).toBe(EstadoComprobante.ANULADO);
    expect(originalAnulado.anuladoEn).toEqual(anuladoEn);
    expect(originalAnulado.motivoAnulacion).toBe('motivo completo');

    // La back-ref original.reversion debe resolver a `reversion`.
    const re = await prisma.comprobante.findUnique({
      where: { id: original.id },
      include: { reversion: true },
    });
    expect(re?.reversion?.id).toBe(reversion.id);
  });
});
