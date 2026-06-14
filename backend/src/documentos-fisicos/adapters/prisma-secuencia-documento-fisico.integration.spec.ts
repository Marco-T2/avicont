import { PrismaClient } from '@prisma/client';

import type { PrismaService } from '@/common/prisma.service';

import { PrismaSecuenciaDocumentoFisicoAdapter } from './prisma-secuencia-documento-fisico';

/**
 * Integration spec del adapter de secuencia de numeración de documentos físicos.
 * Valida la decisión técnica: `INSERT ... ON CONFLICT DO UPDATE RETURNING` serializa
 * correctamente a writers concurrentes bajo Postgres real, sin gaps ni duplicados
 * (Anti-24 CLAUDE.md §4.9 — cicatriz VOUCHER_NUMBER_CONTENTION).
 *
 * Diferencia clave vs comprobantes: la PK no incluye year/month (secuencia continua)
 * y el valor inicial es `numeroInicial` parametrizado (no fijo en 1).
 *
 * Requiere Postgres corriendo en `DATABASE_URL`. Corre con:
 *   DATABASE_URL=... npx jest src/documentos-fisicos/adapters/prisma-secuencia-documento-fisico.integration.spec.ts
 */
describe('PrismaSecuenciaDocumentoFisicoAdapter (integration)', () => {
  // UUIDs fijos para el tenant y tipo del test — sin FK en secuencias_documento_fisico.
  const TENANT_ID = '00000000-0000-0000-0000-0000000000b1';
  const TIPO_ID_A = '00000000-0000-0000-0000-00000000aa01';
  const TIPO_ID_B = '00000000-0000-0000-0000-00000000aa02';

  let prisma: PrismaClient;
  let adapter: PrismaSecuenciaDocumentoFisicoAdapter;

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();
    adapter = new PrismaSecuenciaDocumentoFisicoAdapter(prisma as unknown as PrismaService);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.secuenciaDocumentoFisico.deleteMany({
      where: { organizationId: TENANT_ID },
    });
  });

  it('primer documento devuelve exactamente numeroInicial (no N+1, no 1)', async () => {
    const NUMERO_INICIAL = 36;
    const n = await adapter.siguienteNumero(TENANT_ID, TIPO_ID_A, NUMERO_INICIAL);
    expect(n).toBe(NUMERO_INICIAL);
  });

  it('segundo documento devuelve numeroInicial+1, tercero +2 (incremento correcto)', async () => {
    const NUMERO_INICIAL = 100;
    const a = await adapter.siguienteNumero(TENANT_ID, TIPO_ID_A, NUMERO_INICIAL);
    const b = await adapter.siguienteNumero(TENANT_ID, TIPO_ID_A, NUMERO_INICIAL);
    const c = await adapter.siguienteNumero(TENANT_ID, TIPO_ID_A, NUMERO_INICIAL);
    expect(a).toBe(100);
    expect(b).toBe(101);
    expect(c).toBe(102);
  });

  it('mantiene contadores independientes por (organizationId, tipoDocumentoFisicoId)', async () => {
    const NUMERO_INICIAL = 1;
    const tipoA_1 = await adapter.siguienteNumero(TENANT_ID, TIPO_ID_A, NUMERO_INICIAL);
    const tipoB_1 = await adapter.siguienteNumero(TENANT_ID, TIPO_ID_B, NUMERO_INICIAL);
    const tipoA_2 = await adapter.siguienteNumero(TENANT_ID, TIPO_ID_A, NUMERO_INICIAL);

    // Cada bucket es independiente.
    expect(tipoA_1).toBe(1);
    expect(tipoB_1).toBe(1);
    expect(tipoA_2).toBe(2);
  });

  it('N llamadas concurrentes → N valores distintos sin gaps ni duplicados (E-D-AUTO-06)', async () => {
    const N = 50;
    const NUMERO_INICIAL = 1;
    const results = await Promise.all(
      Array.from({ length: N }, () =>
        adapter.siguienteNumero(TENANT_ID, TIPO_ID_A, NUMERO_INICIAL),
      ),
    );

    const unique = new Set(results);
    expect(unique.size).toBe(N);
    expect(Math.min(...results)).toBe(1);
    expect(Math.max(...results)).toBe(N);

    // Valor final persistido en DB debe ser exactamente N.
    const row = await prisma.secuenciaDocumentoFisico.findUnique({
      where: {
        organizationId_tipoDocumentoFisicoId: {
          organizationId: TENANT_ID,
          tipoDocumentoFisicoId: TIPO_ID_A,
        },
      },
    });
    expect(row?.ultimoNumero).toBe(N);
  });

  it('rollback de TX no consume número — la siguiente llamada reutiliza el valor (E-D-AUTO-07)', async () => {
    const NUMERO_INICIAL = 500;

    // Dentro de una TX, si el caller hace ROLLBACK, el número no queda consumido.
    await expect(
      prisma.$transaction(async (tx) => {
        const n = await adapter.siguienteNumero(TENANT_ID, TIPO_ID_A, NUMERO_INICIAL, tx);
        expect(n).toBe(NUMERO_INICIAL);
        throw new Error('rollback intencional');
      }),
    ).rejects.toThrow('rollback intencional');

    // Después del rollback, la siguiente llamada vuelve a numeroInicial (no hubo persist).
    const n = await adapter.siguienteNumero(TENANT_ID, TIPO_ID_A, NUMERO_INICIAL);
    expect(n).toBe(NUMERO_INICIAL);
  });

  it('dos tenants distintos con el mismo tipoDocumentoFisicoId mantienen contadores aislados (E-D-AUTO-08)', async () => {
    const TENANT_2 = '00000000-0000-0000-0000-0000000000b2';
    const NUMERO_INICIAL = 1;

    // Limpiar también el segundo tenant.
    await prisma.secuenciaDocumentoFisico.deleteMany({
      where: { organizationId: TENANT_2 },
    });

    const tenant1_n1 = await adapter.siguienteNumero(TENANT_ID, TIPO_ID_A, NUMERO_INICIAL);
    const tenant2_n1 = await adapter.siguienteNumero(TENANT_2, TIPO_ID_A, NUMERO_INICIAL);
    const tenant1_n2 = await adapter.siguienteNumero(TENANT_ID, TIPO_ID_A, NUMERO_INICIAL);

    expect(tenant1_n1).toBe(1);
    expect(tenant2_n1).toBe(1); // Aislado — empieza su propia secuencia.
    expect(tenant1_n2).toBe(2); // Tenant 1 continúa.

    // Limpieza del segundo tenant.
    await prisma.secuenciaDocumentoFisico.deleteMany({
      where: { organizationId: TENANT_2 },
    });
  });
});
