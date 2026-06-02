import { PrismaClient } from '@prisma/client';

import type { PrismaService } from '@/common/prisma.service';

import { PrismaOrgPackRepository } from './prisma-org-pack.repository';

/**
 * Integration spec de PrismaOrgPackRepository contra Postgres real.
 * Valida el entitlement + activación de packs por org, y que TODAS las queries
 * filtran por organizationId (multi-tenant estricto §4.2).
 */
describe('PrismaOrgPackRepository (integration)', () => {
  const SLUG_A = 'packs-repo-org-a';
  const SLUG_B = 'packs-repo-org-b';
  const CLAVE_PACK = 'packs-repo.test-pack';
  const USER_ID = 'user-habilita-1';

  let prisma: PrismaClient;
  let repo: PrismaOrgPackRepository;
  let orgAId: string;
  let orgBId: string;
  let packId: string;

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();
    repo = new PrismaOrgPackRepository(prisma as unknown as PrismaService);
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await cleanup();
    const pack = await prisma.pack.create({
      data: {
        clave: CLAVE_PACK,
        nombre: 'Pack de prueba del repo',
        verticalAplicable: 'CONTABILIDAD',
        tipo: 'CAPACIDAD',
      },
    });
    packId = pack.id;
    const orgA = await prisma.organization.create({
      data: { name: 'Org A packs', slug: SLUG_A },
    });
    const orgB = await prisma.organization.create({
      data: { name: 'Org B packs', slug: SLUG_B },
    });
    orgAId = orgA.id;
    orgBId = orgB.id;
  });

  async function cleanup() {
    await prisma.orgPackEntitlement.deleteMany({ where: { pack: { clave: CLAVE_PACK } } });
    await prisma.organization.deleteMany({ where: { slug: { in: [SLUG_A, SLUG_B] } } });
    await prisma.pack.deleteMany({ where: { clave: CLAVE_PACK } });
  }

  describe('habilitar', () => {
    it('crea la fila de entitlement con activo=false', async () => {
      const fila = await repo.habilitar(orgAId, packId, USER_ID);

      expect(fila.organizationId).toBe(orgAId);
      expect(fila.packId).toBe(packId);
      expect(fila.activo).toBe(false);
      expect(fila.habilitadoPorUserId).toBe(USER_ID);
    });

    it('la constraint @@unique rechaza el doble entitlement del mismo pack', async () => {
      await repo.habilitar(orgAId, packId, USER_ID);
      await expect(repo.habilitar(orgAId, packId, USER_ID)).rejects.toThrow();
    });
  });

  describe('findByOrgYPack', () => {
    it('devuelve la fila de la org y null para otra org (filtro por tenant)', async () => {
      await repo.habilitar(orgAId, packId, USER_ID);

      const enA = await repo.findByOrgYPack(orgAId, packId);
      const enB = await repo.findByOrgYPack(orgBId, packId);

      expect(enA).not.toBeNull();
      expect(enA?.organizationId).toBe(orgAId);
      expect(enB).toBeNull();
    });
  });

  describe('setActivo', () => {
    it('prende y apaga la activación de la fila de la org', async () => {
      await repo.habilitar(orgAId, packId, USER_ID);

      const prendido = await repo.setActivo(orgAId, packId, true);
      expect(prendido.activo).toBe(true);

      const apagado = await repo.setActivo(orgAId, packId, false);
      expect(apagado.activo).toBe(false);
    });
  });

  describe('findClavesActivasByOrg', () => {
    it('devuelve solo las claves de packs activos de la org', async () => {
      await repo.habilitar(orgAId, packId, USER_ID);

      // habilitado pero no activo → no aparece
      expect(await repo.findClavesActivasByOrg(orgAId)).toEqual([]);

      await repo.setActivo(orgAId, packId, true);
      expect(await repo.findClavesActivasByOrg(orgAId)).toEqual([CLAVE_PACK]);
    });

    it('no devuelve los packs activos de otra org (filtro por tenant)', async () => {
      await repo.habilitar(orgAId, packId, USER_ID);
      await repo.setActivo(orgAId, packId, true);

      expect(await repo.findClavesActivasByOrg(orgBId)).toEqual([]);
    });
  });

  describe('findByOrg', () => {
    it('lista los entitlements de la org enriquecidos con el pack del catálogo', async () => {
      await repo.habilitar(orgAId, packId, USER_ID);

      const lista = await repo.findByOrg(orgAId);

      expect(lista).toHaveLength(1);
      expect(lista[0]?.pack.clave).toBe(CLAVE_PACK);
      expect(lista[0]?.activo).toBe(false);
    });
  });

  describe('revocar', () => {
    it('borra la fila de entitlement de la org', async () => {
      await repo.habilitar(orgAId, packId, USER_ID);

      await repo.revocar(orgAId, packId);

      expect(await repo.findByOrgYPack(orgAId, packId)).toBeNull();
    });
  });
});
