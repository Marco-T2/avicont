import { PrismaClient, TipoComprobante } from '@prisma/client';

import type { PrismaService } from '@/common/prisma.service';

import { PrismaSecuenciaComprobanteAdapter } from './prisma-secuencia-comprobante';

/**
 * Integration spec del adapter de secuencia de numeración. Valida la
 * decisión técnica: `INSERT ... ON CONFLICT DO UPDATE RETURNING` serializa
 * correctamente a writers concurrentes bajo Postgres real, sin gaps ni
 * duplicados (Anti-24 CLAUDE.md §8.1 — cicatriz VOUCHER_NUMBER_CONTENTION).
 *
 * Requiere Postgres corriendo en `DATABASE_URL`. Corre con:
 *   DATABASE_URL=... npx jest src/comprobantes/adapters/prisma-secuencia
 */
describe('PrismaSecuenciaComprobanteAdapter (integration)', () => {
  // UUID fijo para el tenant del test — no tiene FK en secuencias_comprobante,
  // así que no requiere fixture de organización.
  const TENANT_ID = '00000000-0000-0000-0000-0000000000a1';

  let prisma: PrismaClient;
  let adapter: PrismaSecuenciaComprobanteAdapter;

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();
    adapter = new PrismaSecuenciaComprobanteAdapter(prisma as unknown as PrismaService);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.secuenciaComprobante.deleteMany({
      where: { organizationId: TENANT_ID },
    });
  });

  it('devuelve 1 en la primera llamada y va incrementando secuencialmente', async () => {
    const a = await adapter.siguienteCorrelativo(TENANT_ID, TipoComprobante.DIARIO, 2026, 4);
    const b = await adapter.siguienteCorrelativo(TENANT_ID, TipoComprobante.DIARIO, 2026, 4);
    const c = await adapter.siguienteCorrelativo(TENANT_ID, TipoComprobante.DIARIO, 2026, 4);
    expect(a).toBe(1);
    expect(b).toBe(2);
    expect(c).toBe(3);
  });

  it('mantiene contadores independientes por (tipo, year, month)', async () => {
    const diarioAbril = await adapter.siguienteCorrelativo(
      TENANT_ID,
      TipoComprobante.DIARIO,
      2026,
      4,
    );
    const ingresoAbril = await adapter.siguienteCorrelativo(
      TENANT_ID,
      TipoComprobante.INGRESO,
      2026,
      4,
    );
    const diarioMayo = await adapter.siguienteCorrelativo(
      TENANT_ID,
      TipoComprobante.DIARIO,
      2026,
      5,
    );

    // Cada bucket arranca en 1.
    expect(diarioAbril).toBe(1);
    expect(ingresoAbril).toBe(1);
    expect(diarioMayo).toBe(1);
  });

  it('reinicia al siguiente mes sin arrastrar el contador', async () => {
    // 3 DIARIOs en abril.
    await adapter.siguienteCorrelativo(TENANT_ID, TipoComprobante.DIARIO, 2026, 4);
    await adapter.siguienteCorrelativo(TENANT_ID, TipoComprobante.DIARIO, 2026, 4);
    const ultimoAbril = await adapter.siguienteCorrelativo(
      TENANT_ID,
      TipoComprobante.DIARIO,
      2026,
      4,
    );
    expect(ultimoAbril).toBe(3);

    // Mayo empieza en 1, no hereda el 3 de abril.
    const primeroMayo = await adapter.siguienteCorrelativo(
      TENANT_ID,
      TipoComprobante.DIARIO,
      2026,
      5,
    );
    expect(primeroMayo).toBe(1);
  });

  it('50 llamadas concurrentes → 50 valores distintos 1..50 sin gaps ni duplicados', async () => {
    const N = 50;
    const results = await Promise.all(
      Array.from({ length: N }, () =>
        adapter.siguienteCorrelativo(TENANT_ID, TipoComprobante.DIARIO, 2026, 4),
      ),
    );

    const unique = new Set(results);
    expect(unique.size).toBe(N);
    expect(Math.min(...results)).toBe(1);
    expect(Math.max(...results)).toBe(N);

    // El valor final persistido en DB debe ser exactamente N.
    const row = await prisma.secuenciaComprobante.findUnique({
      where: {
        organizationId_tipo_year_month: {
          organizationId: TENANT_ID,
          tipo: TipoComprobante.DIARIO,
          year: 2026,
          month: 4,
        },
      },
    });
    expect(row?.ultimoNumero).toBe(N);
  });

  it('escribe en la misma TX del caller si se pasa tx', async () => {
    // Dentro de una TX, si el caller ROLLBACK-ea, el correlativo NO debe
    // quedar consumido — el upsert se revierte con la TX.
    await expect(
      prisma.$transaction(async (tx) => {
        const n = await adapter.siguienteCorrelativo(
          TENANT_ID,
          TipoComprobante.DIARIO,
          2026,
          4,
          tx,
        );
        expect(n).toBe(1);
        throw new Error('rollback');
      }),
    ).rejects.toThrow('rollback');

    // Después del rollback, la siguiente llamada vuelve a 1 (no hubo persist).
    const n = await adapter.siguienteCorrelativo(TENANT_ID, TipoComprobante.DIARIO, 2026, 4);
    expect(n).toBe(1);
  });
});
