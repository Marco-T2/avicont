/**
 * Integration spec del PrismaMovimientoRepository contra Postgres real.
 * Valida:
 *   - createInversion / createCantidad: persisten con organizationId denormalizado
 *   - listInversionByLote / listCantidadByLote: filtran por org + lote
 *   - sumCantidadByLote: suma correctamente dentro de TX
 *   - eliminarInversion / eliminarCantidad: elimina solo de la org correcta
 *   - Multi-tenancy: ningún método cruza organizaciones
 *   - findByIdForUpdate: retorna con lock dentro de TX
 *
 * Requiere Postgres con DATABASE_URL en el ambiente.
 */
import { PrismaClient, Prisma } from '@prisma/client';

import type { PrismaService } from '@/common/prisma.service';

import { NaturalezaRegistro } from '../domain/enums';
import { PrismaLoteRepository } from './prisma-lote.repository';
import { PrismaMovimientoRepository } from './prisma-movimiento.repository';

describe('PrismaMovimientoRepository (integration)', () => {
  const SLUG_A = 'org-granja-mov-a';
  const SLUG_B = 'org-granja-mov-b';

  let prisma: PrismaClient;
  let movimientoRepo: PrismaMovimientoRepository;
  let loteRepo: PrismaLoteRepository;
  let orgAId: string;
  let orgBId: string;
  let loteAId: string;
  let loteBId: string;
  let tipoInversionId: string;
  let tipoCantidadId: string;

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();
    movimientoRepo = new PrismaMovimientoRepository(prisma as unknown as PrismaService);
    loteRepo = new PrismaLoteRepository(prisma as unknown as PrismaService);
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await cleanup();

    const [a, b] = await Promise.all([
      prisma.organization.create({ data: { slug: SLUG_A, name: 'Org Mov A' } }),
      prisma.organization.create({ data: { slug: SLUG_B, name: 'Org Mov B' } }),
    ]);
    orgAId = a.id;
    orgBId = b.id;

    // Crear lotes para cada org
    const [loteA, loteB] = await Promise.all([
      loteRepo.create(orgAId, {
        cantidadInicial: 1000,
        fechaIngreso: new Date('2026-06-01'),
      }),
      loteRepo.create(orgBId, {
        cantidadInicial: 500,
        fechaIngreso: new Date('2026-06-01'),
      }),
    ]);
    loteAId = loteA.id;
    loteBId = loteB.id;

    // Crear tipos de registro para org A
    const [tipoInv, tipoCant] = await Promise.all([
      prisma.tipoRegistro.create({
        data: {
          organizationId: orgAId,
          nombre: 'Alimento',
          naturaleza: NaturalezaRegistro.INVERSION,
          esSistema: true,
        },
      }),
      prisma.tipoRegistro.create({
        data: {
          organizationId: orgAId,
          nombre: 'Mortalidad',
          naturaleza: NaturalezaRegistro.CANTIDAD,
          esSistema: true,
        },
      }),
    ]);
    tipoInversionId = tipoInv.id;
    tipoCantidadId = tipoCant.id;
  });

  async function cleanup() {
    const orgs = await prisma.organization.findMany({
      where: { slug: { in: [SLUG_A, SLUG_B] } },
      select: { id: true },
    });
    const orgIds = orgs.map((o) => o.id);
    if (orgIds.length > 0) {
      await prisma.movimientoInversion.deleteMany({
        where: { organizationId: { in: orgIds } },
      });
      await prisma.movimientoCantidad.deleteMany({
        where: { organizationId: { in: orgIds } },
      });
      await prisma.lote.deleteMany({ where: { organizationId: { in: orgIds } } });
      await prisma.tipoRegistro.deleteMany({ where: { organizationId: { in: orgIds } } });
    }
    await prisma.organization.deleteMany({ where: { slug: { in: [SLUG_A, SLUG_B] } } });
  }

  // ============================================================
  // createInversion
  // ============================================================

  describe('createInversion', () => {
    it('persiste la inversión con organizationId denormalizado del lote', async () => {
      const row = await movimientoRepo.createInversion(orgAId, {
        loteId: loteAId,
        tipoRegistroId: tipoInversionId,
        monto: new Prisma.Decimal('1250.50'),
        detalle: 'Compra inicial',
        fecha: new Date('2026-06-05'),
      });

      expect(row.organizationId).toBe(orgAId);
      expect(row.loteId).toBe(loteAId);
      expect(row.tipoRegistroId).toBe(tipoInversionId);
      expect(row.monto.toString()).toBe('1250.5');
      expect(row.detalle).toBe('Compra inicial');
      expect(row.id).toBeDefined();
    });
  });

  // ============================================================
  // createCantidad
  // ============================================================

  describe('createCantidad', () => {
    it('persiste el movimiento de cantidad con organizationId correcto', async () => {
      const row = await movimientoRepo.createCantidad(orgAId, {
        loteId: loteAId,
        tipoRegistroId: tipoCantidadId,
        cantidad: 30,
        detalle: null,
        fecha: new Date('2026-06-10'),
      });

      expect(row.organizationId).toBe(orgAId);
      expect(row.loteId).toBe(loteAId);
      expect(row.cantidad).toBe(30);
    });
  });

  // ============================================================
  // listarInversiones / listarCantidades (listInversionByLote)
  // ============================================================

  describe('listarInversiones', () => {
    it('retorna solo las inversiones del lote de la org pedida', async () => {
      await movimientoRepo.createInversion(orgAId, {
        loteId: loteAId,
        tipoRegistroId: tipoInversionId,
        monto: new Prisma.Decimal('500'),
        detalle: null,
        fecha: new Date('2026-06-05'),
      });
      await movimientoRepo.createInversion(orgAId, {
        loteId: loteAId,
        tipoRegistroId: tipoInversionId,
        monto: new Prisma.Decimal('300'),
        detalle: null,
        fecha: new Date('2026-06-06'),
      });

      const lista = await movimientoRepo.listarInversiones(orgAId, loteAId);
      expect(lista).toHaveLength(2);
      expect(lista.every((r) => r.organizationId === orgAId)).toBe(true);
      expect(lista.every((r) => r.loteId === loteAId)).toBe(true);
    });

    it('multi-tenant: no retorna inversiones del lote de otra org', async () => {
      // orgB tiene su propio lote; orgA NO debe verlos
      const lista = await movimientoRepo.listarInversiones(orgAId, loteBId);
      expect(lista).toHaveLength(0);
    });
  });

  describe('listarCantidades', () => {
    it('retorna solo las cantidades del lote de la org pedida', async () => {
      await movimientoRepo.createCantidad(orgAId, {
        loteId: loteAId,
        tipoRegistroId: tipoCantidadId,
        cantidad: 10,
        detalle: null,
        fecha: new Date('2026-06-10'),
      });

      const lista = await movimientoRepo.listarCantidades(orgAId, loteAId);
      expect(lista).toHaveLength(1);
      expect(lista[0]!.cantidad).toBe(10);
    });

    it('multi-tenant: no retorna cantidades del lote de otra org', async () => {
      const lista = await movimientoRepo.listarCantidades(orgAId, loteBId);
      expect(lista).toHaveLength(0);
    });
  });

  // ============================================================
  // sumCantidadByLote
  // ============================================================

  describe('sumCantidadByLote', () => {
    it('retorna 0 si no hay movimientos de cantidad', async () => {
      const sum = await prisma.$transaction(async (tx) => {
        return movimientoRepo.sumCantidadByLote(orgAId, loteAId, tx);
      });
      expect(sum).toBe(0);
    });

    it('suma correctamente varios movimientos de cantidad', async () => {
      await movimientoRepo.createCantidad(orgAId, {
        loteId: loteAId,
        tipoRegistroId: tipoCantidadId,
        cantidad: 10,
        detalle: null,
        fecha: new Date('2026-06-10'),
      });
      await movimientoRepo.createCantidad(orgAId, {
        loteId: loteAId,
        tipoRegistroId: tipoCantidadId,
        cantidad: 25,
        detalle: null,
        fecha: new Date('2026-06-11'),
      });

      const sum = await prisma.$transaction(async (tx) => {
        return movimientoRepo.sumCantidadByLote(orgAId, loteAId, tx);
      });
      expect(sum).toBe(35);
    });

    it('multi-tenant: no cuenta movimientos de otra org', async () => {
      // Aunque loteB pertenece a orgB, preguntar a orgA por loteB devuelve 0
      const sum = await prisma.$transaction(async (tx) => {
        return movimientoRepo.sumCantidadByLote(orgAId, loteBId, tx);
      });
      expect(sum).toBe(0);
    });
  });

  // ============================================================
  // eliminarInversion
  // ============================================================

  describe('eliminarInversion', () => {
    it('elimina el movimiento de inversión correcto', async () => {
      const movimiento = await movimientoRepo.createInversion(orgAId, {
        loteId: loteAId,
        tipoRegistroId: tipoInversionId,
        monto: new Prisma.Decimal('100'),
        detalle: null,
        fecha: new Date('2026-06-05'),
      });

      const deleted = await movimientoRepo.eliminarInversion(orgAId, movimiento.id);
      expect(deleted).toBe(1);

      const lista = await movimientoRepo.listarInversiones(orgAId, loteAId);
      expect(lista).toHaveLength(0);
    });

    it('no elimina inversión de otra org: retorna 0', async () => {
      const movimiento = await movimientoRepo.createInversion(orgAId, {
        loteId: loteAId,
        tipoRegistroId: tipoInversionId,
        monto: new Prisma.Decimal('100'),
        detalle: null,
        fecha: new Date('2026-06-05'),
      });

      // orgB intenta eliminar el movimiento de orgA
      const deleted = await movimientoRepo.eliminarInversion(orgBId, movimiento.id);
      expect(deleted).toBe(0);
    });
  });

  // ============================================================
  // eliminarCantidad
  // ============================================================

  describe('eliminarCantidad', () => {
    it('elimina el movimiento de cantidad correcto', async () => {
      const movimiento = await movimientoRepo.createCantidad(orgAId, {
        loteId: loteAId,
        tipoRegistroId: tipoCantidadId,
        cantidad: 5,
        detalle: null,
        fecha: new Date('2026-06-10'),
      });

      const deleted = await movimientoRepo.eliminarCantidad(orgAId, movimiento.id);
      expect(deleted).toBe(1);

      const lista = await movimientoRepo.listarCantidades(orgAId, loteAId);
      expect(lista).toHaveLength(0);
    });
  });

  // ============================================================
  // findInversionById / findCantidadById
  // ============================================================

  describe('findInversionById', () => {
    it('retorna el movimiento si existe en la org', async () => {
      const movimiento = await movimientoRepo.createInversion(orgAId, {
        loteId: loteAId,
        tipoRegistroId: tipoInversionId,
        monto: new Prisma.Decimal('200'),
        detalle: null,
        fecha: new Date('2026-06-05'),
      });

      const found = await movimientoRepo.findInversionById(orgAId, movimiento.id);
      expect(found).not.toBeNull();
      expect(found!.id).toBe(movimiento.id);
    });

    it('retorna null si el movimiento es de otra org', async () => {
      const movimiento = await movimientoRepo.createInversion(orgAId, {
        loteId: loteAId,
        tipoRegistroId: tipoInversionId,
        monto: new Prisma.Decimal('200'),
        detalle: null,
        fecha: new Date('2026-06-05'),
      });

      const found = await movimientoRepo.findInversionById(orgBId, movimiento.id);
      expect(found).toBeNull();
    });
  });
});

// ============================================================
// findByIdForUpdate (en contexto de la TX)
// ============================================================

describe('LoteRepository.findByIdForUpdate (integration)', () => {
  const SLUG = 'org-granja-forupdate';

  let prisma: PrismaClient;
  let loteRepo: PrismaLoteRepository;
  let orgId: string;

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();
    loteRepo = new PrismaLoteRepository(prisma as unknown as PrismaService);
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await cleanup();
    const org = await prisma.organization.create({
      data: { slug: SLUG, name: 'Org ForUpdate' },
    });
    orgId = org.id;
  });

  async function cleanup() {
    const orgs = await prisma.organization.findMany({
      where: { slug: SLUG },
      select: { id: true },
    });
    const orgIds = orgs.map((o) => o.id);
    if (orgIds.length > 0) {
      await prisma.lote.deleteMany({ where: { organizationId: { in: orgIds } } });
    }
    await prisma.organization.deleteMany({ where: { slug: SLUG } });
  }

  it('retorna el lote con lock pesimista dentro de una TX', async () => {
    const lote = await loteRepo.create(orgId, {
      cantidadInicial: 100,
      fechaIngreso: new Date('2026-06-01'),
    });

    const result = await prisma.$transaction(async (tx) => {
      return loteRepo.findByIdForUpdate(orgId, lote.id, tx);
    });

    expect(result).not.toBeNull();
    expect(result!.id).toBe(lote.id);
    expect(result!.cantidadInicial).toBe(100);
  });

  it('retorna null si el lote es de otra org (defense in depth G-7)', async () => {
    const otraOrg = await prisma.organization.create({
      data: { slug: 'org-otra-forupdate', name: 'Otra Org' },
    });

    try {
      const lote = await loteRepo.create(otraOrg.id, {
        cantidadInicial: 50,
        fechaIngreso: new Date('2026-06-01'),
      });

      const result = await prisma.$transaction(async (tx) => {
        // Intenta lockear el lote de otra org con nuestra org
        return loteRepo.findByIdForUpdate(orgId, lote.id, tx);
      });

      expect(result).toBeNull();
    } finally {
      await prisma.lote.deleteMany({ where: { organizationId: otraOrg.id } });
      await prisma.organization.delete({ where: { id: otraOrg.id } });
    }
  });
});
