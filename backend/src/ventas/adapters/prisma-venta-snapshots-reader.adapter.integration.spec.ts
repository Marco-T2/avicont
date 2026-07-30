import { ClaseCuenta, NaturalezaCuenta, PrismaClient, TipoItem } from '@prisma/client';

import type { PrismaService } from '@/common/prisma.service';

import { PrismaVentaSnapshotsReaderAdapter } from './prisma-venta-snapshots-reader.adapter';

/**
 * Integration de la read-surface de snapshots contra Postgres real.
 * §11.3: misma base de desarrollo — todo scopeado a los tenants del test.
 */
describe('PrismaVentaSnapshotsReaderAdapter (integration)', () => {
  const SLUG_A = 'org-test-ventas-snapshots-a';
  const SLUG_B = 'org-test-ventas-snapshots-b';
  const USER_ID = 'user-seed-ventas-snapshots';

  let prisma: PrismaClient;
  let adapter: PrismaVentaSnapshotsReaderAdapter;
  let tenantA: string;
  let tenantB: string;
  let cuentaIngresoA: string;
  let itemConCuenta: string;
  let itemSinCuenta: string;
  let itemDeB: string;
  let contactoA: string;
  let contactoB: string;

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();
    adapter = new PrismaVentaSnapshotsReaderAdapter(prisma as unknown as PrismaService);
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await cleanup();
    const [a, b] = await Promise.all([
      prisma.organization.create({ data: { slug: SLUG_A, name: 'Org A snapshots' } }),
      prisma.organization.create({ data: { slug: SLUG_B, name: 'Org B snapshots' } }),
    ]);
    tenantA = a.id;
    tenantB = b.id;

    cuentaIngresoA = (
      await prisma.cuenta.create({
        data: {
          organizationId: tenantA,
          codigoInterno: '4.1.2.001',
          nombre: 'VENTA DE SERVICIOS',
          claseCuenta: ClaseCuenta.INGRESO,
          naturaleza: NaturalezaCuenta.ACREEDORA,
          nivel: 3,
          esDetalle: true,
        },
      })
    ).id;

    itemConCuenta = (await crearItem(tenantA, 'Pollo entero', cuentaIngresoA)).id;
    itemSinCuenta = (await crearItem(tenantA, 'Flete', null)).id;
    itemDeB = (await crearItem(tenantB, 'Ítem ajeno', null)).id;

    contactoA = (
      await prisma.contacto.create({
        data: {
          organizationId: tenantA,
          razonSocial: 'Avícola Sur',
          esCliente: true,
          createdByUserId: USER_ID,
        },
      })
    ).id;
    contactoB = (
      await prisma.contacto.create({
        data: {
          organizationId: tenantB,
          razonSocial: 'Cliente ajeno',
          esCliente: true,
          createdByUserId: USER_ID,
        },
      })
    ).id;
  });

  async function cleanup() {
    await prisma.organization.deleteMany({ where: { slug: { in: [SLUG_A, SLUG_B] } } });
  }

  function crearItem(organizationId: string, nombre: string, cuentaIngresoId: string | null) {
    return prisma.item.create({
      data: {
        organizationId,
        nombre,
        tipo: TipoItem.PRODUCTO,
        createdByUserId: USER_ID,
        ...(cuentaIngresoId !== null ? { cuentaIngresoId } : {}),
      },
    });
  }

  describe('obtenerCuentasIngresoDeItems', () => {
    it('mapea la cuenta propia del ítem y null cuando no la tiene', async () => {
      const map = await adapter.obtenerCuentasIngresoDeItems(tenantA, [
        itemConCuenta,
        itemSinCuenta,
      ]);

      expect(map.get(itemConCuenta)).toBe(cuentaIngresoA);
      expect(map.has(itemSinCuenta)).toBe(true);
      expect(map.get(itemSinCuenta)).toBeNull();
    });

    it('un ítem de otro tenant NO aparece en el Map (§4.2 / REQ-VTA-08)', async () => {
      const map = await adapter.obtenerCuentasIngresoDeItems(tenantA, [itemConCuenta, itemDeB]);

      expect(map.has(itemDeB)).toBe(false);
      expect(map.size).toBe(1);
    });

    it('lote vacío → Map vacío sin tocar la base', async () => {
      const map = await adapter.obtenerCuentasIngresoDeItems(tenantA, []);

      expect(map.size).toBe(0);
    });
  });

  describe('obtenerRazonSocialContacto', () => {
    it('devuelve la razón social del contacto del tenant', async () => {
      await expect(adapter.obtenerRazonSocialContacto(tenantA, contactoA)).resolves.toBe(
        'Avícola Sur',
      );
    });

    it('contacto de otro tenant → null (§4.2: no se distingue de inexistente)', async () => {
      await expect(adapter.obtenerRazonSocialContacto(tenantA, contactoB)).resolves.toBeNull();
    });
  });
});
