import { Moneda, Prisma, PrismaClient, TipoComprobante } from '@prisma/client';

import type { PrismaService } from '@/common/prisma.service';

import {
  TipoDocumentoFisicoCodigoDuplicadoError,
  TipoDocumentoFisicoConDocumentosError,
  TipoDocumentoFisicoNombreDuplicadoError,
} from '../domain/tipo-documento-fisico-errors';
import { PrismaTipoDocumentoFisicoRepository } from './prisma-tipo-documento-fisico.repository';

/**
 * Integration spec del `PrismaTipoDocumentoFisicoRepository` contra
 * Postgres real. Valida las reglas que SOLO Postgres puede contestar:
 *   - UNIQUE `(organizationId, codigo)` per-tenant.
 *   - UNIQUE `(organizationId, nombre)` per-tenant.
 *   - FK Restrict desde `documentos_fisicos.tipoDocumentoFisicoId`.
 *   - Multi-tenancy: ningún método cruza tenants.
 *   - Idempotencia del upsert por `(organizationId, codigo)`.
 *
 * Las reglas puras del VO (formato del codigo/nombre) viven en
 * `tipo-documento-fisico-codigo.spec.ts` / `-nombre.spec.ts`.
 */
describe('PrismaTipoDocumentoFisicoRepository (integration)', () => {
  const SLUG_A = 'org-test-tdf-a';
  const SLUG_B = 'org-test-tdf-b';
  const USER_ID_PREFIX = 'user-seed-tdf-';

  let prisma: PrismaClient;
  let repo: PrismaTipoDocumentoFisicoRepository;
  let tenantA: string;
  let tenantB: string;
  let userIdA: string;
  let userIdB: string;

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();
    repo = new PrismaTipoDocumentoFisicoRepository(prisma as unknown as PrismaService);
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
    const [uA, uB] = await Promise.all([
      prisma.user.create({
        data: {
          email: `${USER_ID_PREFIX}a@test.local`,
          hashedPassword: 'x',
        },
      }),
      prisma.user.create({
        data: {
          email: `${USER_ID_PREFIX}b@test.local`,
          hashedPassword: 'x',
        },
      }),
    ]);
    userIdA = uA.id;
    userIdB = uB.id;
  });

  async function cleanup() {
    const orgs = await prisma.organization.findMany({
      where: { slug: { in: [SLUG_A, SLUG_B] } },
      select: { id: true },
    });
    const orgIds = orgs.map((o) => o.id);
    if (orgIds.length > 0) {
      // Orden: documentos_fisicos -> tipos_documento_fisico (por FK Restrict),
      // luego cascadea el resto al borrar la org.
      await prisma.documentoFisico.deleteMany({
        where: { organizationId: { in: orgIds } },
      });
      await prisma.tipoDocumentoFisico.deleteMany({
        where: { organizationId: { in: orgIds } },
      });
    }
    await prisma.organization.deleteMany({
      where: { slug: { in: [SLUG_A, SLUG_B] } },
    });
    await prisma.user.deleteMany({
      where: { email: { startsWith: USER_ID_PREFIX } },
    });
  }

  const baseData = (
    overrides: Partial<Parameters<PrismaTipoDocumentoFisicoRepository['create']>[1]> = {},
  ) => ({
    nombre: 'Factura',
    codigo: 'factura',
    esTributario: true,
    tiposComprobanteAplicables: [TipoComprobante.EGRESO] as TipoComprobante[],
    createdByUserId: userIdA,
    ...overrides,
  });

  // ==========================================================
  // create — happy path
  // ==========================================================

  it('create — persiste con activo=true por default y respeta el resto del payload', async () => {
    const t = await repo.create(tenantA, baseData());
    expect(t.activo).toBe(true);
    expect(t.organizationId).toBe(tenantA);
    expect(t.codigo).toBe('factura');
    expect(t.nombre).toBe('Factura');
    expect(t.esTributario).toBe(true);
    expect(t.tiposComprobanteAplicables).toEqual([TipoComprobante.EGRESO]);
    expect(t.id).toBeDefined();
  });

  it('create — acepta lista vacía en tiposComprobanteAplicables', async () => {
    const t = await repo.create(tenantA, baseData({ tiposComprobanteAplicables: [] }));
    expect(t.tiposComprobanteAplicables).toEqual([]);
  });

  it('create — acepta createdByUserId nullable (seed del sistema)', async () => {
    const t = await repo.create(
      tenantA,
      baseData({ codigo: 'recibo', nombre: 'Recibo', createdByUserId: null }),
    );
    expect(t.createdByUserId).toBeNull();
  });

  // ==========================================================
  // UNIQUE codigo
  // ==========================================================

  it('UNIQUE codigo — rechaza duplicado en el mismo tenant con TipoDocumentoFisicoCodigoDuplicadoError', async () => {
    await repo.create(tenantA, baseData());
    await expect(repo.create(tenantA, baseData({ nombre: 'Factura B' }))).rejects.toBeInstanceOf(
      TipoDocumentoFisicoCodigoDuplicadoError,
    );
  });

  it('UNIQUE codigo — el mismo codigo SÍ se permite entre tenants distintos', async () => {
    await repo.create(tenantA, { ...baseData(), createdByUserId: userIdA });
    await repo.create(tenantB, { ...baseData(), createdByUserId: userIdB });
    const totalA = await prisma.tipoDocumentoFisico.count({
      where: { organizationId: tenantA, codigo: 'factura' },
    });
    const totalB = await prisma.tipoDocumentoFisico.count({
      where: { organizationId: tenantB, codigo: 'factura' },
    });
    expect(totalA).toBe(1);
    expect(totalB).toBe(1);
  });

  // ==========================================================
  // UNIQUE nombre
  // ==========================================================

  it('UNIQUE nombre — rechaza duplicado en el mismo tenant con TipoDocumentoFisicoNombreDuplicadoError', async () => {
    await repo.create(tenantA, baseData());
    await expect(repo.create(tenantA, baseData({ codigo: 'factura-b' }))).rejects.toBeInstanceOf(
      TipoDocumentoFisicoNombreDuplicadoError,
    );
  });

  it('UNIQUE nombre — el mismo nombre SÍ se permite entre tenants distintos', async () => {
    await repo.create(tenantA, { ...baseData(), createdByUserId: userIdA });
    await repo.create(tenantB, { ...baseData(), createdByUserId: userIdB });
    const totalA = await prisma.tipoDocumentoFisico.count({
      where: { organizationId: tenantA, nombre: 'Factura' },
    });
    const totalB = await prisma.tipoDocumentoFisico.count({
      where: { organizationId: tenantB, nombre: 'Factura' },
    });
    expect(totalA).toBe(1);
    expect(totalB).toBe(1);
  });

  // ==========================================================
  // findById — multi-tenancy
  // ==========================================================

  it('findById — devuelve null si el id pertenece a otro tenant', async () => {
    const t = await repo.create(tenantA, baseData());
    const cross = await repo.findById(tenantB, t.id);
    expect(cross).toBeNull();
    const own = await repo.findById(tenantA, t.id);
    expect(own?.id).toBe(t.id);
  });

  // ==========================================================
  // findByCodigo
  // ==========================================================

  it('findByCodigo — devuelve el tipo si existe en el tenant', async () => {
    const t = await repo.create(tenantA, baseData());
    const found = await repo.findByCodigo(tenantA, 'factura');
    expect(found?.id).toBe(t.id);
  });

  it('findByCodigo — no cruza tenants', async () => {
    await repo.create(tenantA, baseData());
    const cross = await repo.findByCodigo(tenantB, 'factura');
    expect(cross).toBeNull();
  });

  // ==========================================================
  // listar — multi-tenancy y filtros
  // ==========================================================

  it('listar — no cruza tenants', async () => {
    await repo.create(tenantA, baseData());
    const { total } = await repo.listar(tenantB, {}, { page: 1, limit: 20 });
    expect(total).toBe(0);
  });

  it('listar — por default excluye inactivos', async () => {
    const a = await repo.create(tenantA, baseData());
    const b = await repo.create(tenantA, baseData({ codigo: 'recibo', nombre: 'Recibo' }));
    await repo.setActivo(tenantA, b.id, false);
    const { items, total } = await repo.listar(tenantA, {}, { page: 1, limit: 20 });
    expect(total).toBe(1);
    expect(items[0]?.id).toBe(a.id);
  });

  it('listar activo=all — trae activos e inactivos', async () => {
    const a = await repo.create(tenantA, baseData());
    const b = await repo.create(tenantA, baseData({ codigo: 'recibo', nombre: 'Recibo' }));
    await repo.setActivo(tenantA, b.id, false);
    const { total } = await repo.listar(tenantA, { activo: 'all' }, { page: 1, limit: 20 });
    expect(total).toBe(2);
    void a;
  });

  it('listar q — match parcial case-insensitive sobre nombre', async () => {
    await repo.create(tenantA, baseData({ codigo: 'factura', nombre: 'Factura A' }));
    await repo.create(tenantA, baseData({ codigo: 'recibo', nombre: 'Recibo Interno' }));
    const { items, total } = await repo.listar(tenantA, { q: 'recib' }, { page: 1, limit: 20 });
    expect(total).toBe(1);
    expect(items[0]?.codigo).toBe('recibo');
  });

  it('listar — orden por defecto esTributario DESC, nombre ASC (REQ-T-09)', async () => {
    await repo.create(
      tenantA,
      baseData({
        codigo: 'recibo',
        nombre: 'Recibo',
        esTributario: false,
      }),
    );
    await repo.create(
      tenantA,
      baseData({
        codigo: 'nota-debito',
        nombre: 'Nota de Débito',
        esTributario: true,
      }),
    );
    await repo.create(
      tenantA,
      baseData({
        codigo: 'factura',
        nombre: 'Factura',
        esTributario: true,
      }),
    );
    const { items } = await repo.listar(tenantA, { activo: 'all' }, { page: 1, limit: 20 });
    expect(items.map((i) => i.codigo)).toEqual(['factura', 'nota-debito', 'recibo']);
  });

  // ==========================================================
  // update — PATCH semantics
  // ==========================================================

  it('update — sólo toca los campos presentes', async () => {
    const t = await repo.create(tenantA, baseData());
    const updated = await repo.update(tenantA, t.id, { nombre: 'Factura Premium' });
    expect(updated.nombre).toBe('Factura Premium');
    expect(updated.esTributario).toBe(true); // intacto
    expect(updated.codigo).toBe('factura'); // intacto
  });

  // ==========================================================
  // setActivo — toggle
  // ==========================================================

  it('setActivo — toggle on/off conserva resto de campos', async () => {
    const t = await repo.create(tenantA, baseData());
    const off = await repo.setActivo(tenantA, t.id, false);
    expect(off.activo).toBe(false);
    expect(off.codigo).toBe('factura');
    const on = await repo.setActivo(tenantA, t.id, true);
    expect(on.activo).toBe(true);
  });

  // ==========================================================
  // countDocumentosFisicos
  // ==========================================================

  it('countDocumentosFisicos — devuelve 0 si no hay documentos', async () => {
    const t = await repo.create(tenantA, baseData());
    const n = await repo.countDocumentosFisicos(tenantA, t.id);
    expect(n).toBe(0);
  });

  it('countDocumentosFisicos — cuenta correctamente y filtra por tenant', async () => {
    const t = await repo.create(tenantA, baseData());
    await prisma.documentoFisico.create({
      data: {
        organizationId: tenantA,
        tipoDocumentoFisicoId: t.id,
        numero: 'F-0001',
        fechaEmision: new Date('2026-04-01'),
        monto: new Prisma.Decimal('150.00'),
        moneda: Moneda.BOB,
        glosa: null,
        contactoId: null,
        createdByUserId: userIdA,
      },
    });
    expect(await repo.countDocumentosFisicos(tenantA, t.id)).toBe(1);
    // Otro tenant que pregunta por el mismo id no debe ver nada.
    expect(await repo.countDocumentosFisicos(tenantB, t.id)).toBe(0);
  });

  // ==========================================================
  // eliminar + FK Restrict
  // ==========================================================

  it('eliminar — OK cuando no hay documentos referenciadores', async () => {
    const t = await repo.create(tenantA, baseData());
    const count = await repo.eliminar(tenantA, t.id);
    expect(count).toBe(1);
    expect(await repo.findById(tenantA, t.id)).toBeNull();
  });

  it('eliminar — devuelve 0 si el id pertenece a otro tenant', async () => {
    const t = await repo.create(tenantA, baseData());
    const count = await repo.eliminar(tenantB, t.id);
    expect(count).toBe(0);
    expect((await repo.findById(tenantA, t.id))?.id).toBe(t.id);
  });

  it('FK Restrict — eliminar falla con TipoDocumentoFisicoConDocumentosError si tiene documentos', async () => {
    const t = await repo.create(tenantA, baseData());
    await prisma.documentoFisico.create({
      data: {
        organizationId: tenantA,
        tipoDocumentoFisicoId: t.id,
        numero: 'F-0002',
        fechaEmision: new Date('2026-04-01'),
        monto: new Prisma.Decimal('250.00'),
        moneda: Moneda.BOB,
        glosa: null,
        contactoId: null,
        createdByUserId: userIdA,
      },
    });
    await expect(repo.eliminar(tenantA, t.id)).rejects.toBeInstanceOf(
      TipoDocumentoFisicoConDocumentosError,
    );
  });

  // ==========================================================
  // upsertSeed — idempotencia y actualización
  // ==========================================================

  it('upsertSeed — primer ejecución crea las filas del seed', async () => {
    await repo.upsertSeed(tenantA, [
      {
        codigo: 'factura',
        nombre: 'Factura',
        esTributario: true,
        tiposComprobanteAplicables: [TipoComprobante.EGRESO],
      },
      {
        codigo: 'recibo',
        nombre: 'Recibo',
        esTributario: false,
        tiposComprobanteAplicables: [TipoComprobante.INGRESO],
      },
    ]);
    const total = await prisma.tipoDocumentoFisico.count({
      where: { organizationId: tenantA },
    });
    expect(total).toBe(2);
  });

  it('upsertSeed — segunda ejecución es idempotente (no duplica filas)', async () => {
    const seeds = [
      {
        codigo: 'factura',
        nombre: 'Factura',
        esTributario: true,
        tiposComprobanteAplicables: [TipoComprobante.EGRESO],
      },
      {
        codigo: 'recibo',
        nombre: 'Recibo',
        esTributario: false,
        tiposComprobanteAplicables: [TipoComprobante.INGRESO],
      },
    ];
    await repo.upsertSeed(tenantA, seeds);
    await repo.upsertSeed(tenantA, seeds);
    const total = await prisma.tipoDocumentoFisico.count({
      where: { organizationId: tenantA },
    });
    expect(total).toBe(2);
  });

  it('upsertSeed — actualiza nombre/esTributario/tiposComprobanteAplicables si cambian', async () => {
    await repo.upsertSeed(tenantA, [
      {
        codigo: 'factura',
        nombre: 'Factura v1',
        esTributario: false,
        tiposComprobanteAplicables: [TipoComprobante.EGRESO],
      },
    ]);
    await repo.upsertSeed(tenantA, [
      {
        codigo: 'factura',
        nombre: 'Factura v2',
        esTributario: true,
        tiposComprobanteAplicables: [TipoComprobante.EGRESO, TipoComprobante.DIARIO],
      },
    ]);
    const row = await prisma.tipoDocumentoFisico.findFirst({
      where: { organizationId: tenantA, codigo: 'factura' },
    });
    expect(row?.nombre).toBe('Factura v2');
    expect(row?.esTributario).toBe(true);
    expect(row?.tiposComprobanteAplicables).toEqual([
      TipoComprobante.EGRESO,
      TipoComprobante.DIARIO,
    ]);
  });
});
