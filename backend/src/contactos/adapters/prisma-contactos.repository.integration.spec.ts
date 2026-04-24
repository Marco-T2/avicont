import {
  ClaseCuenta,
  EstadoComprobante,
  Moneda,
  NaturalezaCuenta,
  Prisma,
  PrismaClient,
  TipoComprobante,
} from '@prisma/client';

import type { PrismaService } from '@/common/prisma.service';

import { PrismaContactosRepository } from './prisma-contactos.repository';

/**
 * Integration spec del `PrismaContactosRepository` contra Postgres real.
 * Valida las reglas que SOLO Postgres puede contestar:
 *   - Unicidad parcial (organizationId, documento) WHERE documento IS NOT NULL.
 *   - CHECK constraint "esCliente" OR "esProveedor".
 *   - FK Restrict desde lineas_comprobante.contactoId.
 *   - GIN trigram para ILIKE parcial sobre razonSocial y nombreComercial.
 *   - Multi-tenancy (findById / eliminar no cruzan tenants).
 *
 * Las reglas de negocio puras (normalización, flags, razón social) viven
 * en `contacto-validator.spec.ts` y no se repiten acá.
 */
describe('PrismaContactosRepository (integration)', () => {
  const SLUG_A = 'org-test-contactos-a';
  const SLUG_B = 'org-test-contactos-b';
  const USER_ID = 'user-seed-contactos';

  let prisma: PrismaClient;
  let repo: PrismaContactosRepository;
  let tenantA: string;
  let tenantB: string;

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();
    repo = new PrismaContactosRepository(prisma as unknown as PrismaService);
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await cleanup();
    const [a, b] = await Promise.all([
      prisma.organization.create({ data: { slug: SLUG_A, name: 'Org A' } }),
      prisma.organization.create({ data: { slug: SLUG_B, name: 'Org B' } }),
    ]);
    tenantA = a.id;
    tenantB = b.id;
  });

  async function cleanup() {
    // lineas_comprobante.cuentaId y .contactoId son Restrict: hay que borrar
    // comprobantes (cascadea lineas) ANTES que org cascade intente bajar a
    // cuentas/contactos. Mismo tipo de orden que cleanupTestData en test/.
    const orgs = await prisma.organization.findMany({
      where: { slug: { in: [SLUG_A, SLUG_B] } },
      select: { id: true },
    });
    const orgIds = orgs.map((o) => o.id);
    if (orgIds.length > 0) {
      await prisma.comprobante.deleteMany({
        where: { organizationId: { in: orgIds } },
      });
    }
    await prisma.organization.deleteMany({
      where: { slug: { in: [SLUG_A, SLUG_B] } },
    });
  }

  const baseData = (overrides: Partial<Parameters<PrismaContactosRepository['create']>[1]> = {}) => ({
    razonSocial: 'Granjas El Sol SRL',
    nombreComercial: null,
    documento: null,
    esCliente: true,
    esProveedor: false,
    email: null,
    telefono: null,
    direccion: null,
    createdByUserId: USER_ID,
    ...overrides,
  });

  // ==========================================================
  // create — happy path
  // ==========================================================

  it('create — persiste con activo=true por default', async () => {
    const c = await repo.create(tenantA, baseData());
    expect(c.activo).toBe(true);
    expect(c.organizationId).toBe(tenantA);
    expect(c.razonSocial).toBe('Granjas El Sol SRL');
    expect(c.id).toBeDefined();
  });

  // ==========================================================
  // Unicidad parcial (organizationId, documento)
  // ==========================================================

  it('unique parcial — permite N contactos sin documento en el mismo tenant', async () => {
    await repo.create(tenantA, baseData({ razonSocial: 'Contacto 1', documento: null }));
    await repo.create(tenantA, baseData({ razonSocial: 'Contacto 2', documento: null }));
    await repo.create(tenantA, baseData({ razonSocial: 'Contacto 3', documento: null }));
    const total = await prisma.contacto.count({ where: { organizationId: tenantA } });
    expect(total).toBe(3);
  });

  it('unique parcial — rechaza documento duplicado en el mismo tenant', async () => {
    await repo.create(tenantA, baseData({ razonSocial: 'Primero', documento: '1234567019' }));
    await expect(
      repo.create(tenantA, baseData({ razonSocial: 'Duplicado', documento: '1234567019' })),
    ).rejects.toMatchObject({ code: 'P2002' }); // Prisma unique violation
  });

  it('unique parcial — documento repetido SÍ se permite entre tenants distintos', async () => {
    await repo.create(tenantA, baseData({ razonSocial: 'Tenant A', documento: '7777777' }));
    await repo.create(tenantB, baseData({ razonSocial: 'Tenant B', documento: '7777777' }));
    const a = await prisma.contacto.findFirst({
      where: { organizationId: tenantA, documento: '7777777' },
    });
    const b = await prisma.contacto.findFirst({
      where: { organizationId: tenantB, documento: '7777777' },
    });
    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
    expect(a?.id).not.toBe(b?.id);
  });

  // ==========================================================
  // CHECK constraint — al menos un flag activo
  // ==========================================================

  it('CHECK constraint — rechaza create con ambos flags false', async () => {
    await expect(
      repo.create(tenantA, baseData({ esCliente: false, esProveedor: false })),
    ).rejects.toThrow();
  });

  it('CHECK constraint — rechaza update que deja ambos flags false', async () => {
    const c = await repo.create(
      tenantA,
      baseData({ esCliente: true, esProveedor: false }),
    );
    await expect(
      repo.update(tenantA, c.id, { esCliente: false }),
    ).rejects.toThrow();
  });

  // ==========================================================
  // findByDocumento
  // ==========================================================

  it('findByDocumento — devuelve null sin tocar BD si documento es null o ""', async () => {
    expect(await repo.findByDocumento(tenantA, null)).toBeNull();
    expect(await repo.findByDocumento(tenantA, '')).toBeNull();
  });

  it('findByDocumento — devuelve el contacto si existe en el tenant', async () => {
    const c = await repo.create(tenantA, baseData({ documento: '9988776' }));
    const found = await repo.findByDocumento(tenantA, '9988776');
    expect(found?.id).toBe(c.id);
  });

  it('findByDocumento — no cruza tenants', async () => {
    await repo.create(tenantA, baseData({ documento: '5555555' }));
    const crossTenant = await repo.findByDocumento(tenantB, '5555555');
    expect(crossTenant).toBeNull();
  });

  // ==========================================================
  // findById — multi-tenancy
  // ==========================================================

  it('findById — devuelve null si pertenece a otro tenant', async () => {
    const c = await repo.create(tenantA, baseData());
    const cross = await repo.findById(tenantB, c.id);
    expect(cross).toBeNull();
    const own = await repo.findById(tenantA, c.id);
    expect(own?.id).toBe(c.id);
  });

  // ==========================================================
  // listar con q — usa GIN trigram (ILIKE parcial)
  // ==========================================================

  it('listar q — encuentra por infix sobre razonSocial (case-insensitive)', async () => {
    await repo.create(tenantA, baseData({ razonSocial: 'Marcos Pérez Olivera' }));
    await repo.create(tenantA, baseData({ razonSocial: 'Granjas El Sol' }));
    const { items, total } = await repo.listar(
      tenantA,
      { q: 'marc' },
      { page: 1, limit: 20 },
    );
    expect(total).toBe(1);
    expect(items[0]?.razonSocial).toBe('Marcos Pérez Olivera');
  });

  it('listar q — también matchea en nombreComercial', async () => {
    await repo.create(
      tenantA,
      baseData({ razonSocial: 'Sociedad Avícola Santa Cruz SA', nombreComercial: 'Granjas El Sol' }),
    );
    const { items } = await repo.listar(
      tenantA,
      { q: 'sol' },
      { page: 1, limit: 20 },
    );
    expect(items).toHaveLength(1);
    expect(items[0]?.nombreComercial).toBe('Granjas El Sol');
  });

  it('listar — por default excluye inactivos', async () => {
    const c1 = await repo.create(tenantA, baseData({ razonSocial: 'Activo' }));
    const c2 = await repo.create(tenantA, baseData({ razonSocial: 'Inactivo' }));
    await repo.setActivo(tenantA, c2.id, false);
    const { items, total } = await repo.listar(
      tenantA,
      {},
      { page: 1, limit: 20 },
    );
    expect(total).toBe(1);
    expect(items[0]?.id).toBe(c1.id);
  });

  it('listar activo=false — trae sólo inactivos', async () => {
    await repo.create(tenantA, baseData({ razonSocial: 'A' }));
    const c = await repo.create(tenantA, baseData({ razonSocial: 'I' }));
    await repo.setActivo(tenantA, c.id, false);
    const { items, total } = await repo.listar(
      tenantA,
      { activo: false },
      { page: 1, limit: 20 },
    );
    expect(total).toBe(1);
    expect(items[0]?.id).toBe(c.id);
  });

  it('listar activo=all — trae activos e inactivos', async () => {
    await repo.create(tenantA, baseData({ razonSocial: 'A' }));
    const c = await repo.create(tenantA, baseData({ razonSocial: 'I' }));
    await repo.setActivo(tenantA, c.id, false);
    const { total } = await repo.listar(
      tenantA,
      { activo: 'all' },
      { page: 1, limit: 20 },
    );
    expect(total).toBe(2);
  });

  it('listar — no cruza tenants', async () => {
    await repo.create(tenantA, baseData({ razonSocial: 'Solo en A' }));
    const { total } = await repo.listar(tenantB, {}, { page: 1, limit: 20 });
    expect(total).toBe(0);
  });

  // ==========================================================
  // update — PATCH semantics
  // ==========================================================

  it('update — sólo toca los campos presentes', async () => {
    const c = await repo.create(
      tenantA,
      baseData({ razonSocial: 'Original', email: 'original@x.com', esCliente: true }),
    );
    const updated = await repo.update(tenantA, c.id, { razonSocial: 'Nuevo' });
    expect(updated.razonSocial).toBe('Nuevo');
    expect(updated.email).toBe('original@x.com'); // intacto
    expect(updated.esCliente).toBe(true); // intacto
  });

  it('update — setea documento a null (clear) pasando null explícito', async () => {
    const c = await repo.create(tenantA, baseData({ documento: '1111111' }));
    const updated = await repo.update(tenantA, c.id, { documento: null });
    expect(updated.documento).toBeNull();
  });

  // ==========================================================
  // setActivo
  // ==========================================================

  it('setActivo — toggle funciona y conserva resto de campos', async () => {
    const c = await repo.create(tenantA, baseData({ razonSocial: 'X' }));
    const off = await repo.setActivo(tenantA, c.id, false);
    expect(off.activo).toBe(false);
    const on = await repo.setActivo(tenantA, c.id, true);
    expect(on.activo).toBe(true);
  });

  // ==========================================================
  // eliminar + countLineasReferenciadoras + FK Restrict
  // ==========================================================

  it('eliminar — OK cuando no hay líneas referenciadoras', async () => {
    const c = await repo.create(tenantA, baseData());
    const count = await repo.eliminar(tenantA, c.id);
    expect(count).toBe(1);
    const gone = await repo.findById(tenantA, c.id);
    expect(gone).toBeNull();
  });

  it('eliminar — devuelve 0 si el id pertenece a otro tenant', async () => {
    const c = await repo.create(tenantA, baseData());
    const count = await repo.eliminar(tenantB, c.id);
    expect(count).toBe(0);
    const still = await repo.findById(tenantA, c.id);
    expect(still?.id).toBe(c.id);
  });

  it('FK Restrict — eliminar falla si una línea de comprobante lo referencia', async () => {
    const c = await repo.create(tenantA, baseData({ razonSocial: 'Referenciado' }));
    // Fixture mínima: cuenta + periodo + comprobante + linea apuntando al contacto.
    const cuenta = await prisma.cuenta.create({
      data: {
        organizationId: tenantA,
        codigoInterno: '1.1.1.001',
        nombre: 'Caja',
        claseCuenta: ClaseCuenta.ACTIVO,
        naturaleza: NaturalezaCuenta.DEUDORA,
        nivel: 4,
        esDetalle: true,
        requiereContacto: false,
      },
    });
    const gestion = await prisma.gestionFiscal.create({
      data: { organizationId: tenantA, year: 2026, mesInicio: 1, status: 'ABIERTA' },
    });
    const periodo = await prisma.periodoFiscal.create({
      data: {
        organizationId: tenantA,
        gestionId: gestion.id,
        year: 2026,
        month: 4,
        ordenEnGestion: 4,
        status: 'ABIERTO',
      },
    });
    await prisma.comprobante.create({
      data: {
        organizationId: tenantA,
        tipo: TipoComprobante.DIARIO,
        estado: EstadoComprobante.BORRADOR,
        fechaContable: new Date('2026-04-22'),
        periodoFiscalId: periodo.id,
        glosa: 'Test FK Restrict',
        createdByUserId: USER_ID,
        lineas: {
          create: [
            {
              organizationId: tenantA,
              orden: 1,
              cuentaId: cuenta.id,
              contactoId: c.id,
              moneda: Moneda.BOB,
              debito: new Prisma.Decimal('100.00'),
              credito: new Prisma.Decimal('0.00'),
              tipoCambio: new Prisma.Decimal('1'),
              debitoBob: new Prisma.Decimal('100.00'),
              creditoBob: new Prisma.Decimal('0.00'),
            },
          ],
        },
      },
    });

    const referenciadoras = await repo.countLineasReferenciadoras(tenantA, c.id);
    expect(referenciadoras).toBe(1);

    await expect(repo.eliminar(tenantA, c.id)).rejects.toThrow();
  });

  it('countLineasReferenciadoras — 0 si no hay líneas', async () => {
    const c = await repo.create(tenantA, baseData());
    const count = await repo.countLineasReferenciadoras(tenantA, c.id);
    expect(count).toBe(0);
  });
});
