import { PrismaClient } from '@prisma/client';

import type { PrismaService } from '@/common/prisma.service';

import { EstadoLote } from '../domain/enums';
import { PrismaLoteRepository } from './prisma-lote.repository';

/**
 * Integration spec del PrismaLoteRepository contra Postgres real.
 * Valida:
 *   - CRUD básico (create, findById, listar, update, cerrar)
 *   - Multi-tenancy: ningún método cruza organizaciones
 *   - findById retorna null si el lote es de otra org
 *   - listar filtra correctamente por estado y organización
 */
describe('PrismaLoteRepository (integration)', () => {
  const SLUG_A = 'org-granja-lote-a';
  const SLUG_B = 'org-granja-lote-b';

  let prisma: PrismaClient;
  let repo: PrismaLoteRepository;
  let orgAId: string;
  let orgBId: string;

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();
    repo = new PrismaLoteRepository(prisma as unknown as PrismaService);
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await cleanup();
    const [a, b] = await Promise.all([
      prisma.organization.create({ data: { slug: SLUG_A, name: 'Org Granja A' } }),
      prisma.organization.create({ data: { slug: SLUG_B, name: 'Org Granja B' } }),
    ]);
    orgAId = a.id;
    orgBId = b.id;
  });

  async function cleanup() {
    const orgs = await prisma.organization.findMany({
      where: { slug: { in: [SLUG_A, SLUG_B] } },
      select: { id: true },
    });
    const orgIds = orgs.map((o) => o.id);
    if (orgIds.length > 0) {
      await prisma.lote.deleteMany({ where: { organizationId: { in: orgIds } } });
    }
    await prisma.organization.deleteMany({ where: { slug: { in: [SLUG_A, SLUG_B] } } });
  }

  const loteData = () => ({
    cantidadInicial: 500,
    fechaIngreso: new Date('2026-06-01'),
    galpon: 'Galpón A',
    fechaEstimadaSaca: null,
  });

  // ==========================================================
  // create
  // ==========================================================

  it('create — persiste el lote con estado ACTIVO y organizationId correcto', async () => {
    const row = await repo.create(orgAId, loteData());
    expect(row.organizationId).toBe(orgAId);
    expect(row.estado).toBe(EstadoLote.ACTIVO);
    expect(row.cantidadInicial).toBe(500);
    expect(row.galpon).toBe('Galpón A');
    expect(row.id).toBeDefined();
    expect(row.fechaCierre).toBeNull();
  });

  // ==========================================================
  // findById — multi-tenancy
  // ==========================================================

  it('findById — retorna null si el lote no existe', async () => {
    const result = await repo.findById(orgAId, 'non-existent-id');
    expect(result).toBeNull();
  });

  it('findById — retorna null si el lote pertenece a otra org (multi-tenant)', async () => {
    const row = await repo.create(orgAId, loteData());
    const cross = await repo.findById(orgBId, row.id);
    expect(cross).toBeNull();
  });

  it('findById — retorna el lote si es de la org correcta', async () => {
    const row = await repo.create(orgAId, loteData());
    const found = await repo.findById(orgAId, row.id);
    expect(found?.id).toBe(row.id);
    expect(found?.cantidadInicial).toBe(500);
  });

  // ==========================================================
  // listar — multi-tenancy y filtros
  // ==========================================================

  it('listar — no cruza organizaciones (aislamiento multi-tenant)', async () => {
    await repo.create(orgAId, loteData());
    const { total } = await repo.listar(orgBId, {}, { page: 1, limit: 20 });
    expect(total).toBe(0);
  });

  it('listar — retorna lotes de la org pedida', async () => {
    await repo.create(orgAId, loteData());
    await repo.create(orgAId, { ...loteData(), galpon: 'Galpón B' });
    const { items, total } = await repo.listar(orgAId, {}, { page: 1, limit: 20 });
    expect(total).toBe(2);
    items.forEach((l) => expect(l.organizationId).toBe(orgAId));
  });

  it('listar — filtra por estado ACTIVO correctamente', async () => {
    const lote1 = await repo.create(orgAId, loteData());
    await repo.create(orgAId, { ...loteData(), galpon: 'Galpón B' });
    // Cerrar solo el primero
    await repo.cerrar(orgAId, lote1.id, new Date('2026-07-01'));

    const { items: activos } = await repo.listar(
      orgAId,
      { estado: EstadoLote.ACTIVO },
      { page: 1, limit: 20 },
    );
    expect(activos.every((l) => l.estado === EstadoLote.ACTIVO)).toBe(true);
    expect(activos).toHaveLength(1);

    const { items: cerrados } = await repo.listar(
      orgAId,
      { estado: EstadoLote.CERRADO },
      { page: 1, limit: 20 },
    );
    expect(cerrados).toHaveLength(1);
    expect(cerrados[0]?.estado).toBe(EstadoLote.CERRADO);
  });

  it('listar — paginación funciona', async () => {
    await Promise.all([
      repo.create(orgAId, { ...loteData(), galpon: 'A' }),
      repo.create(orgAId, { ...loteData(), galpon: 'B' }),
      repo.create(orgAId, { ...loteData(), galpon: 'C' }),
    ]);
    const { items, total } = await repo.listar(orgAId, {}, { page: 1, limit: 2 });
    expect(total).toBe(3);
    expect(items).toHaveLength(2);
  });

  // ==========================================================
  // update — PATCH semántica
  // ==========================================================

  it('update — actualiza solo los campos presentes', async () => {
    const row = await repo.create(orgAId, loteData());
    const updated = await repo.update(orgAId, row.id, { galpon: 'Galpón Nuevo' });
    expect(updated.galpon).toBe('Galpón Nuevo');
    expect(updated.cantidadInicial).toBe(500); // intacto
    expect(updated.estado).toBe(EstadoLote.ACTIVO); // intacto
  });

  it('update — cantidadInicial NO está en LoteUpdateData (inmutable)', async () => {
    // El tipo LoteUpdateData no incluye cantidadInicial, así que TypeScript
    // ya lo previene en compilación. Aquí verificamos que el repo no lo toca.
    const row = await repo.create(orgAId, loteData());
    // @ts-expect-error — verificando que el tipo no acepta cantidadInicial
    const updated = await repo.update(orgAId, row.id, { cantidadInicial: 9999 });
    const refetch = await repo.findById(orgAId, updated.id);
    expect(refetch?.cantidadInicial).toBe(500); // no se modificó
  });

  // ==========================================================
  // cerrar
  // ==========================================================

  it('cerrar — setea estado=CERRADO y fechaCierre', async () => {
    const row = await repo.create(orgAId, loteData());
    const fechaCierre = new Date('2026-07-15');
    const cerrado = await repo.cerrar(orgAId, row.id, fechaCierre);
    expect(cerrado.estado).toBe(EstadoLote.CERRADO);
    expect(cerrado.fechaCierre).not.toBeNull();
  });

  it('cerrar — no afecta lotes de otra org', async () => {
    const rowB = await repo.create(orgBId, loteData());
    // Intentar cerrar desde orgA — Prisma no encontrará el registro
    await expect(repo.cerrar(orgAId, rowB.id, new Date())).rejects.toThrow();
    // El lote en orgB sigue ACTIVO
    const found = await repo.findById(orgBId, rowB.id);
    expect(found?.estado).toBe(EstadoLote.ACTIVO);
  });

  // ==========================================================
  // findByIdForUpdate (básico — concurrencia compleja es S4)
  // ==========================================================

  it('findByIdForUpdate — retorna el lote dentro de una TX', async () => {
    const row = await repo.create(orgAId, loteData());
    const result = await prisma.$transaction(async (tx) => {
      return repo.findByIdForUpdate(orgAId, row.id, tx);
    });
    expect(result?.id).toBe(row.id);
    expect(result?.cantidadInicial).toBe(500);
  });

  it('findByIdForUpdate — retorna null si el lote es de otra org (multi-tenant)', async () => {
    const row = await repo.create(orgAId, loteData());
    const result = await prisma.$transaction(async (tx) => {
      return repo.findByIdForUpdate(orgBId, row.id, tx);
    });
    expect(result).toBeNull();
  });
});
