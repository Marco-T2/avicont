import { PrismaClient, TipoItem } from '@prisma/client';

import type { PrismaService } from '@/common/prisma.service';

import { PrismaItemsRepository } from './prisma-items.repository';

/**
 * Integration spec del `PrismaItemsRepository` contra Postgres real.
 * Valida lo que SOLO Postgres puede contestar:
 *   - UNIQUE PARCIAL (organizationId, codigo) WHERE codigo IS NOT NULL.
 *   - Multi-tenancy: findById / findByCodigo / listar no cruzan tenants.
 *   - El default de `cantidadPorDefecto` y el tipo Decimal(18,6).
 *
 * La normalización del código es pura y vive en `item-validator.spec.ts`;
 * no se repite acá.
 *
 * §11.3: la suite corre contra la MISMA base de desarrollo, así que TODA
 * aserción de conteo va acotada a los tenants que este test crea.
 */
describe('PrismaItemsRepository (integration)', () => {
  const SLUG_A = 'org-test-items-a';
  const SLUG_B = 'org-test-items-b';
  const USER_ID = 'user-seed-items';

  let prisma: PrismaClient;
  let repo: PrismaItemsRepository;
  let tenantA: string;
  let tenantB: string;

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();
    repo = new PrismaItemsRepository(prisma as unknown as PrismaService);
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await cleanup();
    const [a, b] = await Promise.all([
      prisma.organization.create({ data: { slug: SLUG_A, name: 'Org A items' } }),
      prisma.organization.create({ data: { slug: SLUG_B, name: 'Org B items' } }),
    ]);
    tenantA = a.id;
    tenantB = b.id;
  });

  async function cleanup() {
    // lineas_venta.itemId es Restrict: hay que bajar las ventas (que
    // cascadean sus líneas) ANTES de que el cascade de organization intente
    // borrar los items.
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

  const datosBase = (over: Partial<Parameters<PrismaItemsRepository['create']>[1]> = {}) => ({
    codigo: null,
    nombre: 'Pollo entero',
    tipo: TipoItem.PRODUCTO,
    unidadMedida: null,
    precioUnitarioSugerido: null,
    cantidadPorDefecto: null,
    cuentaIngresoId: null,
    createdByUserId: USER_ID,
    ...over,
  });

  describe('create', () => {
    it('guarda un ítem con sólo el nombre y el tipo (D-24)', async () => {
      const item = await repo.create(tenantA, datosBase());

      expect(item.nombre).toBe('Pollo entero');
      expect(item.codigo).toBeNull();
      expect(item.activo).toBe(true);
      // El default del schema, no un valor que mande el caller.
      expect(item.cantidadPorDefecto.toString()).toBe('1');
    });

    it('persiste el precio sugerido con 6 decimales', async () => {
      // (18,6): el precio por unidad puede necesitar sub-centavo. Si la
      // columna fuera (18,2) esto se redondearía en silencio.
      const item = await repo.create(tenantA, datosBase({ precioUnitarioSugerido: '6.305001' }));

      expect(item.precioUnitarioSugerido?.toString()).toBe('6.305001');
    });
  });

  describe('UNIQUE PARCIAL del código', () => {
    it('deja convivir N ítems sin código', async () => {
      await repo.create(tenantA, datosBase({ nombre: 'Sin código A' }));
      await repo.create(tenantA, datosBase({ nombre: 'Sin código B' }));

      const { total } = await repo.listar(tenantA, {}, { page: 1, limit: 10 });
      expect(total).toBe(2);
    });

    it('rechaza el mismo código dentro del tenant', async () => {
      await repo.create(tenantA, datosBase({ codigo: 'P-01' }));

      await expect(repo.create(tenantA, datosBase({ codigo: 'P-01' }))).rejects.toThrow();
    });

    it('el mismo código en OTRO tenant es legal', async () => {
      await repo.create(tenantA, datosBase({ codigo: 'P-01' }));

      await expect(repo.create(tenantB, datosBase({ codigo: 'P-01' }))).resolves.toBeDefined();
    });
  });

  describe('findByCodigo', () => {
    it('encuentra por código dentro del tenant', async () => {
      const creado = await repo.create(tenantA, datosBase({ codigo: 'P-01' }));

      await expect(repo.findByCodigo(tenantA, 'P-01')).resolves.toMatchObject({ id: creado.id });
    });

    it('no cruza tenants', async () => {
      await repo.create(tenantA, datosBase({ codigo: 'P-01' }));

      await expect(repo.findByCodigo(tenantB, 'P-01')).resolves.toBeNull();
    });

    // Sin código no hay unicidad que chequear: la consulta no debe pegarle a
    // la BD ni, peor, devolver "el primer ítem sin código" — eso haría que el
    // guard del service rechazara toda alta sin código a partir de la segunda.
    it('con código null devuelve null sin consultar', async () => {
      await repo.create(tenantA, datosBase({ nombre: 'Sin código' }));

      await expect(repo.findByCodigo(tenantA, null)).resolves.toBeNull();
    });
  });

  describe('findById', () => {
    it('no cruza tenants (404, no 403 — la existencia ajena no se revela)', async () => {
      const item = await repo.create(tenantA, datosBase());

      await expect(repo.findById(tenantB, item.id)).resolves.toBeNull();
    });
  });

  describe('setActivo', () => {
    it('desactiva sin borrar', async () => {
      const item = await repo.create(tenantA, datosBase());

      const desactivado = await repo.setActivo(tenantA, item.id, false);

      expect(desactivado.activo).toBe(false);
      await expect(repo.findById(tenantA, item.id)).resolves.not.toBeNull();
    });
  });

  describe('listar', () => {
    beforeEach(async () => {
      await repo.create(tenantA, datosBase({ nombre: 'Pollo entero', codigo: 'P-01' }));
      await repo.create(tenantA, datosBase({ nombre: 'Flete', tipo: TipoItem.SERVICIO }));
      const inactivo = await repo.create(tenantA, datosBase({ nombre: 'Descontinuado' }));
      await repo.setActivo(tenantA, inactivo.id, false);
      await repo.create(tenantB, datosBase({ nombre: 'De otro tenant' }));
    });

    it('sólo activos por default', async () => {
      const { items, total } = await repo.listar(tenantA, {}, { page: 1, limit: 10 });

      expect(total).toBe(2);
      expect(items.map((i) => i.nombre).sort()).toEqual(['Flete', 'Pollo entero']);
    });

    it("activo: 'all' trae también los inactivos", async () => {
      const { total } = await repo.listar(tenantA, { activo: 'all' }, { page: 1, limit: 10 });

      expect(total).toBe(3);
    });

    it('filtra por tipo', async () => {
      const { items } = await repo.listar(
        tenantA,
        { tipo: TipoItem.SERVICIO },
        { page: 1, limit: 10 },
      );

      expect(items.map((i) => i.nombre)).toEqual(['Flete']);
    });

    it('busca por nombre y por código, sin distinguir case', async () => {
      const porNombre = await repo.listar(tenantA, { q: 'pollo' }, { page: 1, limit: 10 });
      expect(porNombre.items.map((i) => i.nombre)).toEqual(['Pollo entero']);

      const porCodigo = await repo.listar(tenantA, { q: 'p-01' }, { page: 1, limit: 10 });
      expect(porCodigo.items.map((i) => i.nombre)).toEqual(['Pollo entero']);
    });

    it('no devuelve ítems de otro tenant', async () => {
      const { items } = await repo.listar(tenantA, { activo: 'all' }, { page: 1, limit: 10 });

      expect(items.map((i) => i.nombre)).not.toContain('De otro tenant');
    });

    it('pagina', async () => {
      const { items, total } = await repo.listar(tenantA, {}, { page: 2, limit: 1 });

      expect(total).toBe(2);
      expect(items).toHaveLength(1);
    });
  });
});
