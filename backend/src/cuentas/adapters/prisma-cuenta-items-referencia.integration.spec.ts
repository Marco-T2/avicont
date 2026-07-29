import { ClaseCuenta, NaturalezaCuenta, PrismaClient, TipoItem } from '@prisma/client';

import type { PrismaService } from '@/common/prisma.service';

import { PrismaCuentaRepository } from './prisma-cuenta.repository';

/**
 * Integration spec de `itemsActivosQueUsanCuenta`, que sostiene el guard
 * `CUENTA_REFERENCIADA_POR_ITEMS` (REQ-ITM-05, Anti-41).
 *
 * Va contra Postgres real porque lo que hay que probar es el FILTRO —sólo
 * ítems activos, sólo del tenant—, y eso un mock no lo puede contestar: el
 * spec del service devuelve lo que se le diga.
 *
 * §11.3: todo conteo acotado a los tenants que crea este test.
 */
describe('PrismaCuentaRepository.itemsActivosQueUsanCuenta (integration)', () => {
  const SLUG_A = 'org-test-cuenta-items-a';
  const SLUG_B = 'org-test-cuenta-items-b';

  let prisma: PrismaClient;
  let repo: PrismaCuentaRepository;
  let tenantA: string;
  let tenantB: string;
  let cuentaA: string;

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();
    repo = new PrismaCuentaRepository(prisma as unknown as PrismaService);
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await cleanup();
    const [a, b] = await Promise.all([
      prisma.organization.create({ data: { slug: SLUG_A, name: 'Org A ci' } }),
      prisma.organization.create({ data: { slug: SLUG_B, name: 'Org B ci' } }),
    ]);
    tenantA = a.id;
    tenantB = b.id;

    const cuenta = await prisma.cuenta.create({
      data: {
        organizationId: tenantA,
        codigoInterno: '4.1.1.002',
        nombre: 'VENTAS DE POLLO',
        claseCuenta: ClaseCuenta.INGRESO,
        naturaleza: NaturalezaCuenta.ACREEDORA,
        nivel: 4,
        esDetalle: true,
      },
    });
    cuentaA = cuenta.id;
  });

  async function cleanup() {
    const orgs = await prisma.organization.findMany({
      where: { slug: { in: [SLUG_A, SLUG_B] } },
      select: { id: true },
    });
    const orgIds = orgs.map((o) => o.id);
    if (orgIds.length > 0) {
      await prisma.venta.deleteMany({ where: { organizationId: { in: orgIds } } });
      await prisma.item.deleteMany({ where: { organizationId: { in: orgIds } } });
    }
    await prisma.organization.deleteMany({ where: { slug: { in: [SLUG_A, SLUG_B] } } });
  }

  const crearItem = (tenantId: string, nombre: string, over: Record<string, unknown> = {}) =>
    prisma.item.create({
      data: {
        organizationId: tenantId,
        nombre,
        tipo: TipoItem.PRODUCTO,
        createdByUserId: 'u',
        ...over,
      },
    });

  it('devuelve los ítems activos que apuntan a la cuenta, con id, nombre y código', async () => {
    await crearItem(tenantA, 'Pollo entero', { cuentaIngresoId: cuentaA, codigo: 'P-01' });

    const items = await repo.itemsActivosQueUsanCuenta(tenantA, cuentaA);

    expect(items).toEqual([{ id: expect.any(String), nombre: 'Pollo entero', codigo: 'P-01' }]);
  });

  it('OMITE los ítems inactivos', async () => {
    // Un ítem desactivado no va a generar ninguna venta nueva: bloquearle la
    // cuenta al admin por su culpa sería un bloqueo sin causa.
    await crearItem(tenantA, 'Descontinuado', { cuentaIngresoId: cuentaA, activo: false });

    await expect(repo.itemsActivosQueUsanCuenta(tenantA, cuentaA)).resolves.toEqual([]);
  });

  it('omite los ítems que apuntan a OTRA cuenta', async () => {
    await crearItem(tenantA, 'Sin cuenta propia');

    await expect(repo.itemsActivosQueUsanCuenta(tenantA, cuentaA)).resolves.toEqual([]);
  });

  it('no cruza tenants', async () => {
    // La cuenta es del tenant A; preguntar por ella desde B no debe devolver
    // nada, ni siquiera si B tuviera ítems apuntándole (imposible vía API,
    // pero el filtro no depende de eso).
    await crearItem(tenantA, 'Del tenant A', { cuentaIngresoId: cuentaA });

    await expect(repo.itemsActivosQueUsanCuenta(tenantB, cuentaA)).resolves.toEqual([]);
  });

  it('ordena por nombre para que la lista del error sea estable', async () => {
    await crearItem(tenantA, 'Zapallo', { cuentaIngresoId: cuentaA });
    await crearItem(tenantA, 'Aceite', { cuentaIngresoId: cuentaA });

    const items = await repo.itemsActivosQueUsanCuenta(tenantA, cuentaA);

    expect(items.map((i) => i.nombre)).toEqual(['Aceite', 'Zapallo']);
  });
});
