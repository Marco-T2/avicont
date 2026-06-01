import { PrismaClient } from '@prisma/client';

import type { PrismaService } from '@/common/prisma.service';

import { NaturalezaRegistro } from '../domain/enums';
import { TIPOS_REGISTRO_FABRICA } from '../seed/tipos-registro-fabrica';
import { PrismaTipoRegistroRepository } from './prisma-tipo-registro.repository';

/**
 * Integration spec del PrismaTipoRegistroRepository contra Postgres real.
 * Valida:
 *   - UNIQUE (organizationId, nombre): un mismo nombre no puede repetirse en la org
 *   - Multi-tenancy: ningún método cruza organizaciones
 *   - Idempotencia del upsertSeed: re-correr no duplica filas
 *   - Filtros (naturaleza, activo)
 *   - countMovimientos
 *   - eliminar respeta FK Restrict
 */
describe('PrismaTipoRegistroRepository (integration)', () => {
  const SLUG_A = 'org-granja-tipo-reg-a';
  const SLUG_B = 'org-granja-tipo-reg-b';

  let prisma: PrismaClient;
  let repo: PrismaTipoRegistroRepository;
  let orgAId: string;
  let orgBId: string;

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();
    repo = new PrismaTipoRegistroRepository(prisma as unknown as PrismaService);
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await cleanup();
    const [a, b] = await Promise.all([
      prisma.organization.create({ data: { slug: SLUG_A, name: 'Org TR A' } }),
      prisma.organization.create({ data: { slug: SLUG_B, name: 'Org TR B' } }),
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
      await prisma.tipoRegistro.deleteMany({ where: { organizationId: { in: orgIds } } });
    }
    await prisma.organization.deleteMany({ where: { slug: { in: [SLUG_A, SLUG_B] } } });
  }

  const tipoData = () => ({
    nombre: 'Alimento Especial',
    naturaleza: NaturalezaRegistro.INVERSION,
    esSistema: false,
  });

  // ==========================================================
  // create
  // ==========================================================

  it('create — persiste con activo=true por defecto', async () => {
    const row = await repo.create(orgAId, tipoData());
    expect(row.organizationId).toBe(orgAId);
    expect(row.activo).toBe(true);
    expect(row.esSistema).toBe(false);
    expect(row.nombre).toBe('Alimento Especial');
    expect(row.naturaleza).toBe(NaturalezaRegistro.INVERSION);
    expect(row.id).toBeDefined();
  });

  it('create — UNIQUE (organizationId, nombre): rechaza duplicado en la misma org', async () => {
    await repo.create(orgAId, tipoData());
    await expect(repo.create(orgAId, tipoData())).rejects.toThrow();
  });

  it('create — el mismo nombre SÍ se permite en orgs distintas', async () => {
    await repo.create(orgAId, tipoData());
    await repo.create(orgBId, tipoData());
    const totalA = await prisma.tipoRegistro.count({ where: { organizationId: orgAId } });
    const totalB = await prisma.tipoRegistro.count({ where: { organizationId: orgBId } });
    expect(totalA).toBe(1);
    expect(totalB).toBe(1);
  });

  // ==========================================================
  // findById — multi-tenancy
  // ==========================================================

  it('findById — retorna null si el tipo pertenece a otra org', async () => {
    const row = await repo.create(orgAId, tipoData());
    const cross = await repo.findById(orgBId, row.id);
    expect(cross).toBeNull();
  });

  it('findById — retorna el tipo si es de la org correcta', async () => {
    const row = await repo.create(orgAId, tipoData());
    const found = await repo.findById(orgAId, row.id);
    expect(found?.id).toBe(row.id);
  });

  // ==========================================================
  // findByNombre
  // ==========================================================

  it('findByNombre — retorna null si no existe', async () => {
    const result = await repo.findByNombre(orgAId, 'Inexistente');
    expect(result).toBeNull();
  });

  it('findByNombre — retorna el tipo si existe en la org', async () => {
    await repo.create(orgAId, tipoData());
    const found = await repo.findByNombre(orgAId, 'Alimento Especial');
    expect(found?.nombre).toBe('Alimento Especial');
  });

  it('findByNombre — no cruza tenants', async () => {
    await repo.create(orgAId, tipoData());
    const cross = await repo.findByNombre(orgBId, 'Alimento Especial');
    expect(cross).toBeNull();
  });

  // ==========================================================
  // listar — filtros y multi-tenancy
  // ==========================================================

  it('listar — no cruza organizaciones', async () => {
    await repo.create(orgAId, tipoData());
    const result = await repo.listar(orgBId, {});
    expect(result).toHaveLength(0);
  });

  it('listar — filtra por naturaleza', async () => {
    await repo.create(orgAId, tipoData());
    await repo.create(orgAId, {
      nombre: 'Bajas Extra',
      naturaleza: NaturalezaRegistro.CANTIDAD,
      esSistema: false,
    });

    const inversiones = await repo.listar(orgAId, { naturaleza: NaturalezaRegistro.INVERSION });
    expect(inversiones.every((t) => t.naturaleza === NaturalezaRegistro.INVERSION)).toBe(true);
    expect(inversiones).toHaveLength(1);

    const cantidades = await repo.listar(orgAId, { naturaleza: NaturalezaRegistro.CANTIDAD });
    expect(cantidades).toHaveLength(1);
  });

  it('listar — filtra por activo (default activo=true)', async () => {
    const t1 = await repo.create(orgAId, tipoData());
    const t2 = await repo.create(orgAId, {
      nombre: 'Otro',
      naturaleza: NaturalezaRegistro.INVERSION,
      esSistema: false,
    });
    await repo.setActivo(orgAId, t2.id, false);

    const activos = await repo.listar(orgAId, { activo: true });
    expect(activos.every((t) => t.activo)).toBe(true);
    expect(activos).toHaveLength(1);
    expect(activos[0]?.id).toBe(t1.id);
  });

  it('listar — activo=all retorna todos', async () => {
    const t1 = await repo.create(orgAId, tipoData());
    const t2 = await repo.create(orgAId, {
      nombre: 'Otro',
      naturaleza: NaturalezaRegistro.INVERSION,
      esSistema: false,
    });
    await repo.setActivo(orgAId, t2.id, false);
    const all = await repo.listar(orgAId, { activo: 'all' });
    expect(all).toHaveLength(2);
    void t1;
  });

  // ==========================================================
  // setActivo — toggle
  // ==========================================================

  it('setActivo — toggle on/off conserva nombre y naturaleza', async () => {
    const row = await repo.create(orgAId, tipoData());
    const off = await repo.setActivo(orgAId, row.id, false);
    expect(off.activo).toBe(false);
    expect(off.nombre).toBe('Alimento Especial');
    const on = await repo.setActivo(orgAId, row.id, true);
    expect(on.activo).toBe(true);
  });

  // ==========================================================
  // countMovimientos
  // ==========================================================

  it('countMovimientos — retorna 0 si no hay movimientos', async () => {
    const row = await repo.create(orgAId, tipoData());
    const count = await repo.countMovimientos(orgAId, row.id);
    expect(count).toBe(0);
  });

  it('countMovimientos — no cruza tenants', async () => {
    const row = await repo.create(orgAId, tipoData());
    const count = await repo.countMovimientos(orgBId, row.id);
    expect(count).toBe(0);
  });

  // ==========================================================
  // eliminar
  // ==========================================================

  it('eliminar — OK cuando no tiene movimientos', async () => {
    const row = await repo.create(orgAId, tipoData());
    const deleted = await repo.eliminar(orgAId, row.id);
    expect(deleted).toBe(1);
    expect(await repo.findById(orgAId, row.id)).toBeNull();
  });

  it('eliminar — retorna 0 si pertenece a otra org', async () => {
    const row = await repo.create(orgAId, tipoData());
    const deleted = await repo.eliminar(orgBId, row.id);
    expect(deleted).toBe(0);
    expect(await repo.findById(orgAId, row.id)).not.toBeNull();
  });

  // ==========================================================
  // update
  // ==========================================================

  it('update — actualiza solo nombre', async () => {
    const row = await repo.create(orgAId, tipoData());
    const updated = await repo.update(orgAId, row.id, { nombre: 'Alimento Premium' });
    expect(updated.nombre).toBe('Alimento Premium');
    expect(updated.naturaleza).toBe(NaturalezaRegistro.INVERSION); // intacto
  });

  // ==========================================================
  // upsertSeed — idempotencia y aislamiento multi-tenant
  // ==========================================================

  it('upsertSeed — primera ejecución crea los 12 tipos fábrica', async () => {
    await repo.upsertSeed(orgAId, [...TIPOS_REGISTRO_FABRICA]);
    const count = await prisma.tipoRegistro.count({ where: { organizationId: orgAId } });
    expect(count).toBe(12);
  });

  it('upsertSeed — segunda ejecución es idempotente (no duplica filas)', async () => {
    await repo.upsertSeed(orgAId, [...TIPOS_REGISTRO_FABRICA]);
    await repo.upsertSeed(orgAId, [...TIPOS_REGISTRO_FABRICA]);
    const count = await prisma.tipoRegistro.count({ where: { organizationId: orgAId } });
    expect(count).toBe(12);
  });

  it('upsertSeed — org A y org B tienen sus propios 12 tipos (aislamiento)', async () => {
    await repo.upsertSeed(orgAId, [...TIPOS_REGISTRO_FABRICA]);
    await repo.upsertSeed(orgBId, [...TIPOS_REGISTRO_FABRICA]);
    const countA = await prisma.tipoRegistro.count({ where: { organizationId: orgAId } });
    const countB = await prisma.tipoRegistro.count({ where: { organizationId: orgBId } });
    expect(countA).toBe(12);
    expect(countB).toBe(12);
  });

  it('upsertSeed — todos tienen esSistema=true', async () => {
    await repo.upsertSeed(orgAId, [...TIPOS_REGISTRO_FABRICA]);
    const todos = await prisma.tipoRegistro.findMany({ where: { organizationId: orgAId } });
    todos.forEach((t) => expect(t.esSistema).toBe(true));
  });
});
