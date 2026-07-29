import { ActividadFlujo, ClaseCuenta, NaturalezaCuenta, PrismaClient } from '@prisma/client';

import { PrismaCuentasEfectivoReaderAdapter } from './prisma-cuentas-efectivo-reader.adapter';

/**
 * Integración del adapter de `CuentasEfectivoReaderPort` contra Postgres real.
 *
 * El criterio en sí ya está cubierto por `domain/elegibilidad-efectivo.spec.ts`
 * (unit puro, incluida la validación por mutación). Lo que sólo se puede probar
 * acá es lo que depende de la BD:
 *
 *  1. **Aislamiento multi-tenant** (§4.2) — una cuenta elegible de OTRA
 *     organización tiene que dar `false`. Es la parte con consecuencia de
 *     seguridad: sin el filtro, un tenant podría debitar contra una cuenta
 *     ajena.
 *  2. **El round-trip del enum** `actividadFlujo` Prisma → dominio, incluido el
 *     `null`, que es el estado de las 110 cuentas del seed hoy.
 */
describe('PrismaCuentasEfectivoReaderAdapter (integration)', () => {
  const SLUG_A = 'org-efectivo-reader-a';
  const SLUG_B = 'org-efectivo-reader-b';

  let prisma: PrismaClient;
  let adapter: PrismaCuentasEfectivoReaderAdapter;
  let orgA: string;
  let orgB: string;

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();
    adapter = new PrismaCuentasEfectivoReaderAdapter(prisma as never);
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await cleanup();
    const a = await prisma.organization.create({ data: { slug: SLUG_A, name: 'Org A' } });
    const b = await prisma.organization.create({ data: { slug: SLUG_B, name: 'Org B' } });
    orgA = a.id;
    orgB = b.id;
  });

  async function cleanup() {
    const orgs = await prisma.organization.findMany({
      where: { slug: { in: [SLUG_A, SLUG_B] } },
      select: { id: true },
    });
    const ids = orgs.map((o) => o.id);
    if (ids.length === 0) return;
    await prisma.cuenta.deleteMany({ where: { organizationId: { in: ids } } });
    await prisma.organization.deleteMany({ where: { id: { in: ids } } });
  }

  async function crearCuenta(
    organizationId: string,
    over: {
      codigoInterno: string;
      activa?: boolean;
      esDetalle?: boolean;
      actividadFlujo?: ActividadFlujo | null;
    },
  ): Promise<string> {
    const cuenta = await prisma.cuenta.create({
      data: {
        organizationId,
        codigoInterno: over.codigoInterno,
        nombre: `Cuenta ${over.codigoInterno}`,
        claseCuenta: ClaseCuenta.ACTIVO,
        naturaleza: NaturalezaCuenta.DEUDORA,
        nivel: over.codigoInterno.split('.').length,
        esDetalle: over.esDetalle ?? true,
        activa: over.activa ?? true,
        ...(over.actividadFlujo !== undefined ? { actividadFlujo: over.actividadFlujo } : {}),
      },
    });
    return cuenta.id;
  }

  it('[+] cuenta bajo el prefijo, sin marca (estado del seed hoy) → elegible', async () => {
    const id = await crearCuenta(orgA, { codigoInterno: '1.1.1.001' });
    await expect(adapter.esElegibleComoDestino(orgA, id)).resolves.toBe(true);
  });

  it('[+] cuenta fuera del prefijo marcada EFECTIVO → elegible (round-trip del enum)', async () => {
    const id = await crearCuenta(orgA, {
      codigoInterno: '1.2.3.001',
      actividadFlujo: ActividadFlujo.EFECTIVO,
    });
    await expect(adapter.esElegibleComoDestino(orgA, id)).resolves.toBe(true);
  });

  it('[+] cuenta bajo el prefijo marcada OPERACION → SIGUE elegible (unión, no fallback)', async () => {
    const id = await crearCuenta(orgA, {
      codigoInterno: '1.1.1.001',
      actividadFlujo: ActividadFlujo.OPERACION,
    });
    await expect(adapter.esElegibleComoDestino(orgA, id)).resolves.toBe(true);
  });

  it('[-] cuenta inactiva → no elegible', async () => {
    const id = await crearCuenta(orgA, { codigoInterno: '1.1.1.001', activa: false });
    await expect(adapter.esElegibleComoDestino(orgA, id)).resolves.toBe(false);
  });

  it('[-] cuenta de OTRA organización, aunque sea elegible → false (§4.2)', async () => {
    const idB = await crearCuenta(orgB, { codigoInterno: '1.1.1.001' });

    // Elegible en su propia org...
    await expect(adapter.esElegibleComoDestino(orgB, idB)).resolves.toBe(true);
    // ...y opaca desde la otra.
    await expect(adapter.esElegibleComoDestino(orgA, idB)).resolves.toBe(false);
  });

  it('[-] cuenta inexistente → false, sin lanzar', async () => {
    await expect(
      adapter.esElegibleComoDestino(orgA, '00000000-0000-0000-0000-000000000000'),
    ).resolves.toBe(false);
  });
});
