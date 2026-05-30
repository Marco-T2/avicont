import { PrismaClient } from '@prisma/client';

import type { PrismaService } from '@/common/prisma.service';

import { PrismaPeriodosReaderAdapter } from './prisma-periodos-reader.adapter';

/**
 * Integration spec de `PrismaPeriodosReaderAdapter.obtenerReaperturaActiva`
 * contra Postgres real.
 *
 * Valida el contrato cross-módulo definido en PeriodosReaderPort:
 *   - null si no hay reapertura activa
 *   - { id, reopenedAt } si hay una reapertura con reclosedAt = null
 *   - null si la única reapertura está cerrada (reclosedAt != null)
 *   - la más reciente si hay múltiples activas (defensivo)
 *   - filtro por organizationId: una reapertura de otro tenant no se devuelve
 */
describe('PrismaPeriodosReaderAdapter — obtenerReaperturaActiva (integration)', () => {
  const SLUG_A = 'org-periodos-reader-a';
  const SLUG_B = 'org-periodos-reader-b';
  const USER_ID = 'user-seed-periodos-reader';

  let prisma: PrismaClient;
  let adapter: PrismaPeriodosReaderAdapter;
  let tenantA: string;
  let tenantB: string;
  let periodoAId: string;
  let periodoBId: string;

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();
    adapter = new PrismaPeriodosReaderAdapter(prisma as unknown as PrismaService);
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await cleanup();

    const [orgA, orgB] = await Promise.all([
      prisma.organization.create({ data: { slug: SLUG_A, name: 'Org Reader A' } }),
      prisma.organization.create({ data: { slug: SLUG_B, name: 'Org Reader B' } }),
    ]);
    tenantA = orgA.id;
    tenantB = orgB.id;

    const [gestionA, gestionB] = await Promise.all([
      prisma.gestionFiscal.create({
        data: {
          organizationId: tenantA,
          year: 2026,
          mesInicio: 1,
        },
      }),
      prisma.gestionFiscal.create({
        data: {
          organizationId: tenantB,
          year: 2026,
          mesInicio: 1,
        },
      }),
    ]);

    const [periodoA, periodoB] = await Promise.all([
      prisma.periodoFiscal.create({
        data: {
          organizationId: tenantA,
          gestionId: gestionA.id,
          year: 2026,
          month: 1,
          ordenEnGestion: 1,
          status: 'CERRADO',
        },
      }),
      prisma.periodoFiscal.create({
        data: {
          organizationId: tenantB,
          gestionId: gestionB.id,
          year: 2026,
          month: 1,
          ordenEnGestion: 1,
          status: 'CERRADO',
        },
      }),
    ]);

    periodoAId = periodoA.id;
    periodoBId = periodoB.id;
  });

  async function cleanup() {
    // Borrar reaperturas primero (FK), luego períodos, gestiones, orgs (cascade)
    const orgs = await prisma.organization.findMany({
      where: { slug: { in: [SLUG_A, SLUG_B] } },
      select: { id: true },
    });
    const orgIds = orgs.map((o) => o.id);
    if (orgIds.length > 0) {
      const periodos = await prisma.periodoFiscal.findMany({
        where: { organizationId: { in: orgIds } },
        select: { id: true },
      });
      const periodoIds = periodos.map((p) => p.id);
      if (periodoIds.length > 0) {
        await prisma.periodoFiscalReopening.deleteMany({
          where: { periodoId: { in: periodoIds } },
        });
      }
    }
    await prisma.organization.deleteMany({
      where: { slug: { in: [SLUG_A, SLUG_B] } },
    });
  }

  describe('obtenerReaperturaActiva', () => {
    it('retorna null si no hay ninguna reapertura para el período', async () => {
      const result = await adapter.obtenerReaperturaActiva(tenantA, periodoAId);

      expect(result).toBeNull();
    });

    it('retorna { id, reopenedAt } cuando hay una reapertura con reclosedAt = null', async () => {
      const reopening = await prisma.periodoFiscalReopening.create({
        data: {
          periodoId: periodoAId,
          reopenedByUserId: USER_ID,
          motivo: 'Corrección de comprobantes del período de enero 2026',
          reclosedAt: null,
        },
      });

      const result = await adapter.obtenerReaperturaActiva(tenantA, periodoAId);

      expect(result).not.toBeNull();
      expect(result!.id).toBe(reopening.id);
      expect(result!.reopenedAt).toEqual(reopening.reopenedAt);
    });

    it('retorna null si la única reapertura está cerrada (reclosedAt != null)', async () => {
      await prisma.periodoFiscalReopening.create({
        data: {
          periodoId: periodoAId,
          reopenedByUserId: USER_ID,
          motivo: 'Corrección de comprobantes del período de enero 2026',
          reclosedAt: new Date('2026-01-20T10:00:00Z'),
          reclosedByUserId: USER_ID,
        },
      });

      const result = await adapter.obtenerReaperturaActiva(tenantA, periodoAId);

      expect(result).toBeNull();
    });

    it('retorna la más reciente si hay múltiples reaperturas activas (caso patológico)', async () => {
      // Caso defensivo: no debería ocurrir en producción, pero el adapter
      // debe devolver la más reciente (reopenedAt DESC) para ser determinístico.
      const older = await prisma.periodoFiscalReopening.create({
        data: {
          periodoId: periodoAId,
          reopenedByUserId: USER_ID,
          motivo: 'Primera reapertura — no debería coexistir con otra activa',
          reopenedAt: new Date('2026-01-15T08:00:00Z'),
          reclosedAt: null,
        },
      });
      const newer = await prisma.periodoFiscalReopening.create({
        data: {
          periodoId: periodoAId,
          reopenedByUserId: USER_ID,
          motivo: 'Segunda reapertura — más reciente, debe ser la devuelta',
          reopenedAt: new Date('2026-01-16T08:00:00Z'),
          reclosedAt: null,
        },
      });

      const result = await adapter.obtenerReaperturaActiva(tenantA, periodoAId);

      expect(result).not.toBeNull();
      expect(result!.id).toBe(newer.id);
      // La reapertura más antigua no debe devolverse
      expect(result!.id).not.toBe(older.id);
    });

    it('filtra por organizationId: una reapertura de otro tenant no se devuelve', async () => {
      // Crear reapertura para el tenant B sobre su período
      await prisma.periodoFiscalReopening.create({
        data: {
          periodoId: periodoBId,
          reopenedByUserId: USER_ID,
          motivo: 'Reapertura del tenant B — no debe filtrarse al tenant A',
          reclosedAt: null,
        },
      });

      // Tenant A consulta su período (sin reapertura propia)
      const resultA = await adapter.obtenerReaperturaActiva(tenantA, periodoAId);

      // Tenant A no debe ver la reapertura del período de Tenant B
      expect(resultA).toBeNull();
    });

    it('acepta un TransactionClient opcional y opera dentro de la TX', async () => {
      const reopening = await prisma.periodoFiscalReopening.create({
        data: {
          periodoId: periodoAId,
          reopenedByUserId: USER_ID,
          motivo: 'Reapertura para verificar que el adapter acepta tx opcional',
          reclosedAt: null,
        },
      });

      // Ejecutar dentro de una TX y verificar que el resultado es correcto
      const result = await prisma.$transaction(async (tx) => {
        return adapter.obtenerReaperturaActiva(tenantA, periodoAId, tx);
      });

      expect(result).not.toBeNull();
      expect(result!.id).toBe(reopening.id);
    });
  });
});

// ============================================================
// obtenerRangoFechas — integration spec (Fase 1.4 / 1.5)
// ============================================================

describe('PrismaPeriodosReaderAdapter — obtenerRangoFechas (integration)', () => {
  const SLUG_A = 'org-rango-reader-a';
  const SLUG_B = 'org-rango-reader-b';

  let prisma: PrismaClient;
  let adapter: PrismaPeriodosReaderAdapter;
  let tenantA: string;
  let tenantB: string;
  let periodoEnero: string; // 2026-01 de tenant A
  let periodoMarzo: string; // 2026-03 de tenant A (31 días)

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();
    adapter = new PrismaPeriodosReaderAdapter(prisma as unknown as PrismaService);
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await cleanup();

    const [orgA, orgB] = await Promise.all([
      prisma.organization.create({ data: { slug: SLUG_A, name: 'Org Rango A' } }),
      prisma.organization.create({ data: { slug: SLUG_B, name: 'Org Rango B' } }),
    ]);
    tenantA = orgA.id;
    tenantB = orgB.id;

    const gestionA = await prisma.gestionFiscal.create({
      data: { organizationId: tenantA, year: 2026, mesInicio: 1 },
    });

    const [p1, p3] = await Promise.all([
      prisma.periodoFiscal.create({
        data: {
          organizationId: tenantA,
          gestionId: gestionA.id,
          year: 2026,
          month: 1,
          ordenEnGestion: 1,
          status: 'ABIERTO',
        },
      }),
      prisma.periodoFiscal.create({
        data: {
          organizationId: tenantA,
          gestionId: gestionA.id,
          year: 2026,
          month: 3,
          ordenEnGestion: 3,
          status: 'ABIERTO',
        },
      }),
    ]);

    periodoEnero = p1.id;
    periodoMarzo = p3.id;
  });

  async function cleanup() {
    await prisma.organization.deleteMany({
      where: { slug: { in: [SLUG_A, SLUG_B] } },
    });
  }

  it('devuelve { desde: 2026-01-01, hasta: 2026-01-31 } para enero 2026', async () => {
    const result = await adapter.obtenerRangoFechas(tenantA, periodoEnero);

    expect(result).not.toBeNull();
    // El desde es el primer día del mes (2026-01-01 UTC)
    expect(result!.desde.getUTCFullYear()).toBe(2026);
    expect(result!.desde.getUTCMonth()).toBe(0); // enero = 0
    expect(result!.desde.getUTCDate()).toBe(1);
    // El hasta es el último día del mes (2026-01-31 UTC)
    expect(result!.hasta.getUTCFullYear()).toBe(2026);
    expect(result!.hasta.getUTCMonth()).toBe(0);
    expect(result!.hasta.getUTCDate()).toBe(31);
  });

  it('devuelve { desde: 2026-03-01, hasta: 2026-03-31 } para marzo 2026 (31 días)', async () => {
    const result = await adapter.obtenerRangoFechas(tenantA, periodoMarzo);

    expect(result).not.toBeNull();
    expect(result!.desde.getUTCDate()).toBe(1);
    expect(result!.desde.getUTCMonth()).toBe(2); // marzo = 2
    expect(result!.hasta.getUTCDate()).toBe(31);
    expect(result!.hasta.getUTCMonth()).toBe(2);
  });

  it('retorna null si el período no existe', async () => {
    const result = await adapter.obtenerRangoFechas(tenantA, 'periodo-inexistente-uuid');
    expect(result).toBeNull();
  });

  it('retorna null si el período existe pero pertenece a otro tenant (defense in depth §4.2)', async () => {
    // periodoEnero pertenece a tenantA — consultamos con tenantB
    const result = await adapter.obtenerRangoFechas(tenantB, periodoEnero);
    expect(result).toBeNull();
  });
});
