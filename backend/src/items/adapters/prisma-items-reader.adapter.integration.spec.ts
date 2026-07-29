import { PrismaClient, TipoItem } from '@prisma/client';

import type { PrismaService } from '@/common/prisma.service';

import { PrismaItemsReaderAdapter } from './prisma-items-reader.adapter';

/**
 * Integration spec del `PrismaItemsReaderAdapter`. Es el port que consume
 * `ventas` para validar los `itemId` de las líneas, así que lo que se prueba
 * acá es su CONTRATO: superficie mínima, scope por tenant, y que participe de
 * la transacción del caller.
 */
describe('PrismaItemsReaderAdapter (integration)', () => {
  const SLUG_A = 'org-test-items-reader-a';
  const SLUG_B = 'org-test-items-reader-b';

  let prisma: PrismaClient;
  let adapter: PrismaItemsReaderAdapter;
  let tenantA: string;
  let tenantB: string;

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();
    adapter = new PrismaItemsReaderAdapter(prisma as unknown as PrismaService);
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await cleanup();
    const [a, b] = await Promise.all([
      prisma.organization.create({ data: { slug: SLUG_A, name: 'Org A reader' } }),
      prisma.organization.create({ data: { slug: SLUG_B, name: 'Org B reader' } }),
    ]);
    tenantA = a.id;
    tenantB = b.id;
  });

  async function cleanup() {
    const orgs = await prisma.organization.findMany({
      where: { slug: { in: [SLUG_A, SLUG_B] } },
      select: { id: true },
    });
    const orgIds = orgs.map((o) => o.id);
    if (orgIds.length > 0) {
      await prisma.venta.deleteMany({ where: { organizationId: { in: orgIds } } });
    }
    await prisma.organization.deleteMany({ where: { slug: { in: [SLUG_A, SLUG_B] } } });
  }

  const crearItem = (tenantId: string, nombre: string, activo = true) =>
    prisma.item.create({
      data: {
        organizationId: tenantId,
        nombre,
        tipo: TipoItem.PRODUCTO,
        activo,
        createdByUserId: 'u',
      },
    });

  it('devuelve SOLO id y activo (REQ-ITM-04: la superficie no crece)', async () => {
    const item = await crearItem(tenantA, 'Pollo');

    const mapa = await adapter.obtenerBatch(tenantA, [item.id]);

    // Aserción sobre las CLAVES, no sobre los valores: si alguien suma
    // `nombre` o `precio` al select "porque venía bien", este test lo caza.
    expect(Object.keys(mapa.get(item.id)!).sort()).toEqual(['activo', 'id']);
  });

  it('refleja el flag activo', async () => {
    const activo = await crearItem(tenantA, 'Vigente');
    const inactivo = await crearItem(tenantA, 'Descontinuado', false);

    const mapa = await adapter.obtenerBatch(tenantA, [activo.id, inactivo.id]);

    expect(mapa.get(activo.id)?.activo).toBe(true);
    expect(mapa.get(inactivo.id)?.activo).toBe(false);
  });

  it('omite los ítems de otro tenant en vez de devolverlos', async () => {
    // Es lo que hace que una venta del tenant A con un itemId del tenant B
    // sea rechazada: el id simplemente no aparece en el Map (REQ-VTA-08).
    const ajeno = await crearItem(tenantB, 'Ajeno');

    const mapa = await adapter.obtenerBatch(tenantA, [ajeno.id]);

    expect(mapa.has(ajeno.id)).toBe(false);
  });

  it('omite los ids inexistentes', async () => {
    const mapa = await adapter.obtenerBatch(tenantA, ['no-existe']);

    expect(mapa.size).toBe(0);
  });

  it('con lista vacía no consulta y devuelve un Map vacío', async () => {
    await expect(adapter.obtenerBatch(tenantA, [])).resolves.toEqual(new Map());
  });

  it('deduplica los ids repetidos', async () => {
    const item = await crearItem(tenantA, 'Pollo');

    const mapa = await adapter.obtenerBatch(tenantA, [item.id, item.id, item.id]);

    expect(mapa.size).toBe(1);
  });

  it('participa de la transacción del caller', async () => {
    // Sin esto la lectura ocurriría fuera de la TX de la venta y no se
    // aislaría contra una desactivación concurrente.
    await prisma
      .$transaction(async (tx) => {
        const item = await tx.item.create({
          data: {
            organizationId: tenantA,
            nombre: 'Creado dentro de la TX',
            tipo: TipoItem.PRODUCTO,
            createdByUserId: 'u',
          },
        });

        const mapa = await adapter.obtenerBatch(tenantA, [item.id], tx);
        expect(mapa.has(item.id)).toBe(true);

        throw new Error('rollback');
      })
      .catch((e: Error) => {
        if (e.message !== 'rollback') throw e;
      });

    // Y el rollback se respetó: el ítem no quedó.
    const { count } = await prisma.item.deleteMany({
      where: { organizationId: tenantA, nombre: 'Creado dentro de la TX' },
    });
    expect(count).toBe(0);
  });
});
