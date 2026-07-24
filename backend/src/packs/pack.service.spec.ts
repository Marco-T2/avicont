import type { Prisma, VerticalPack } from '@prisma/client';

import type { Pack } from './domain/pack';
import {
  PackNoEncontradoError,
  PackNoHabilitadoError,
  PackVerticalNoAplicableError,
} from './domain/pack-errors';
import { PackService } from './pack.service';
import type { PackCatalogReaderPort } from './ports/pack-catalog.reader.port';
import type {
  OrgPackEntitlementRow,
  OrgPackRepositoryPort,
} from './ports/org-pack.repository.port';
import type { OrgVerticalReaderPort } from './ports/org-vertical.reader.port';
import type { RedisService } from '@/cache/redis.service';

// ============================================================
// Fixtures y mocks
// ============================================================

const ORG_ID = 'org-1';
const USER_ID = 'user-1';
const PACK_ID = 'pack-1';
const CLAVE = 'contabilidad.adjuntos';
const CACHE_KEY = `org-packs:${ORG_ID}`;

function makePack(overrides: Partial<Pack> = {}): Pack {
  return {
    id: PACK_ID,
    clave: CLAVE,
    nombre: 'Adjuntos a comprobantes',
    descripcion: null,
    verticalAplicable: 'CONTABILIDAD',
    tipo: 'CAPACIDAD',
    activo: true,
    ...overrides,
  };
}

function makeEntitlementRow(overrides: Partial<OrgPackEntitlementRow> = {}): OrgPackEntitlementRow {
  return {
    id: 'ent-1',
    organizationId: ORG_ID,
    packId: PACK_ID,
    activo: false,
    habilitadoPorUserId: USER_ID,
    ...overrides,
  };
}

type MockRepo = jest.Mocked<OrgPackRepositoryPort>;
type MockCatalog = jest.Mocked<PackCatalogReaderPort>;
type MockVertical = jest.Mocked<OrgVerticalReaderPort>;
type MockRedis = Pick<jest.Mocked<RedisService>, 'del'>;

function makeRepoMock(): MockRepo {
  return {
    habilitar: jest.fn(),
    revocar: jest.fn(),
    setActivo: jest.fn(),
    findByOrgYPack: jest.fn(),
    findByOrg: jest.fn(),
    findClavesActivasByOrg: jest.fn(),
  };
}

function makeCatalogMock(): MockCatalog {
  return {
    listar: jest.fn(),
    findByClave: jest.fn(),
    findById: jest.fn(),
    listarOtorgadosPorDefecto: jest.fn(),
  };
}

function makeVerticalMock(vertical: VerticalPack | null = 'CONTABILIDAD'): MockVertical {
  return { verticalDe: jest.fn().mockResolvedValue(vertical) };
}

function makeRedisMock(): MockRedis {
  return { del: jest.fn().mockResolvedValue(undefined) };
}

function makeService(deps?: {
  repo?: MockRepo;
  catalog?: MockCatalog;
  vertical?: MockVertical;
  redis?: MockRedis;
}): {
  service: PackService;
  repo: MockRepo;
  catalog: MockCatalog;
  vertical: MockVertical;
  redis: MockRedis;
} {
  const repo = deps?.repo ?? makeRepoMock();
  const catalog = deps?.catalog ?? makeCatalogMock();
  const vertical = deps?.vertical ?? makeVerticalMock();
  const redis = deps?.redis ?? makeRedisMock();
  const service = new PackService(catalog, repo, vertical, redis as unknown as RedisService);
  return { service, repo, catalog, vertical, redis };
}

describe('PackService', () => {
  describe('habilitar', () => {
    it('crea el entitlement cuando el vertical del pack coincide con el de la org', async () => {
      const { service, repo, catalog } = makeService({
        vertical: makeVerticalMock('CONTABILIDAD'),
      });
      catalog.findById.mockResolvedValue(makePack({ verticalAplicable: 'CONTABILIDAD' }));
      repo.habilitar.mockResolvedValue(makeEntitlementRow());

      await service.habilitar(ORG_ID, PACK_ID, USER_ID);

      expect(repo.habilitar).toHaveBeenCalledWith(ORG_ID, PACK_ID, USER_ID);
    });

    it('invalida el cache org-packs:<id> tras habilitar', async () => {
      const { service, repo, catalog, redis } = makeService({
        vertical: makeVerticalMock('CONTABILIDAD'),
      });
      catalog.findById.mockResolvedValue(makePack({ verticalAplicable: 'CONTABILIDAD' }));
      repo.habilitar.mockResolvedValue(makeEntitlementRow());

      await service.habilitar(ORG_ID, PACK_ID, USER_ID);

      expect(redis.del).toHaveBeenCalledWith(CACHE_KEY);
    });

    it('NO invalida el cache si la habilitación falla por vertical ajeno', async () => {
      const { service, catalog, redis } = makeService({
        vertical: makeVerticalMock('CONTABILIDAD'),
      });
      catalog.findById.mockResolvedValue(makePack({ verticalAplicable: 'GRANJA' }));

      await expect(service.habilitar(ORG_ID, PACK_ID, USER_ID)).rejects.toBeInstanceOf(
        PackVerticalNoAplicableError,
      );
      expect(redis.del).not.toHaveBeenCalled();
    });

    it('rechaza con PackVerticalNoAplicableError si el pack es de otro vertical', async () => {
      const { service, repo, catalog } = makeService({
        vertical: makeVerticalMock('CONTABILIDAD'),
      });
      catalog.findById.mockResolvedValue(makePack({ verticalAplicable: 'GRANJA' }));

      await expect(service.habilitar(ORG_ID, PACK_ID, USER_ID)).rejects.toBeInstanceOf(
        PackVerticalNoAplicableError,
      );
      expect(repo.habilitar).not.toHaveBeenCalled();
    });

    it('rechaza con PackNoEncontradoError si el pack no existe en el catálogo', async () => {
      const { service, repo, catalog } = makeService();
      catalog.findById.mockResolvedValue(null);

      await expect(service.habilitar(ORG_ID, PACK_ID, USER_ID)).rejects.toBeInstanceOf(
        PackNoEncontradoError,
      );
      expect(repo.habilitar).not.toHaveBeenCalled();
    });
  });

  describe('activar', () => {
    it('prende el pack cuando existe el entitlement (frontera satisfecha)', async () => {
      const { service, repo } = makeService();
      repo.findByOrgYPack.mockResolvedValue(makeEntitlementRow({ activo: false }));
      repo.setActivo.mockResolvedValue(makeEntitlementRow({ activo: true }));

      const res = await service.activar(ORG_ID, PACK_ID, true);

      expect(repo.setActivo).toHaveBeenCalledWith(ORG_ID, PACK_ID, true);
      expect(res.activo).toBe(true);
    });

    it('invalida el cache org-packs:<id> tras activar', async () => {
      const { service, repo, redis } = makeService();
      repo.findByOrgYPack.mockResolvedValue(makeEntitlementRow({ activo: false }));
      repo.setActivo.mockResolvedValue(makeEntitlementRow({ activo: true }));

      await service.activar(ORG_ID, PACK_ID, true);

      expect(redis.del).toHaveBeenCalledWith(CACHE_KEY);
    });

    it('rechaza con PackNoHabilitadoError al activar sin entitlement', async () => {
      const { service, repo } = makeService();
      repo.findByOrgYPack.mockResolvedValue(null);

      await expect(service.activar(ORG_ID, PACK_ID, true)).rejects.toBeInstanceOf(
        PackNoHabilitadoError,
      );
      expect(repo.setActivo).not.toHaveBeenCalled();
    });

    it('el PackNoHabilitadoError expone el packId real en details (no un campo mal nombrado)', async () => {
      const { service, repo } = makeService();
      repo.findByOrgYPack.mockResolvedValue(null);

      let error: PackNoHabilitadoError | undefined;
      try {
        await service.activar(ORG_ID, PACK_ID, true);
      } catch (e) {
        error = e as PackNoHabilitadoError;
      }

      expect(error).toBeInstanceOf(PackNoHabilitadoError);
      // El details debe exponer 'packId', NO 'clave' — cuando se lanza desde activar()
      // solo está disponible el UUID del pack, no la clave estable.
      expect(error?.details).toEqual({ packId: PACK_ID });
    });
  });

  describe('activarPorClave (resolución clave → packId + frontera)', () => {
    it('resuelve la clave y delega en activar', async () => {
      const { service, repo, catalog } = makeService();
      catalog.findByClave.mockResolvedValue(makePack());
      repo.findByOrgYPack.mockResolvedValue(makeEntitlementRow({ activo: false }));
      repo.setActivo.mockResolvedValue(makeEntitlementRow({ activo: true }));

      const res = await service.activarPorClave(ORG_ID, CLAVE, true);

      expect(catalog.findByClave).toHaveBeenCalledWith(CLAVE);
      expect(repo.setActivo).toHaveBeenCalledWith(ORG_ID, PACK_ID, true);
      expect(res.activo).toBe(true);
    });

    it('desactiva (activo=false) cuando hay entitlement', async () => {
      const { service, repo, catalog, redis } = makeService();
      catalog.findByClave.mockResolvedValue(makePack());
      repo.findByOrgYPack.mockResolvedValue(makeEntitlementRow({ activo: true }));
      repo.setActivo.mockResolvedValue(makeEntitlementRow({ activo: false }));

      const res = await service.activarPorClave(ORG_ID, CLAVE, false);

      expect(repo.setActivo).toHaveBeenCalledWith(ORG_ID, PACK_ID, false);
      expect(redis.del).toHaveBeenCalledWith(CACHE_KEY);
      expect(res.activo).toBe(false);
    });

    it('rechaza con PackNoEncontradoError si la clave no existe en el catálogo', async () => {
      const { service, repo, catalog } = makeService();
      catalog.findByClave.mockResolvedValue(null);

      await expect(service.activarPorClave(ORG_ID, 'no.existe', true)).rejects.toBeInstanceOf(
        PackNoEncontradoError,
      );
      expect(repo.setActivo).not.toHaveBeenCalled();
    });

    it('rechaza con PackNoHabilitadoError (frontera) si el pack existe pero NO está habilitado', async () => {
      const { service, repo, catalog } = makeService();
      catalog.findByClave.mockResolvedValue(makePack());
      repo.findByOrgYPack.mockResolvedValue(null);

      await expect(service.activarPorClave(ORG_ID, CLAVE, true)).rejects.toBeInstanceOf(
        PackNoHabilitadoError,
      );
      expect(repo.setActivo).not.toHaveBeenCalled();
    });
  });

  describe('listarMisPacks', () => {
    it('devuelve los entitlements de la org con su pack y estado de activación', async () => {
      const { service, repo } = makeService();
      const entitlements = [{ ...makeEntitlementRow({ activo: true }), pack: makePack() }];
      repo.findByOrg.mockResolvedValue(entitlements);

      expect(await service.listarMisPacks(ORG_ID)).toBe(entitlements);
      expect(repo.findByOrg).toHaveBeenCalledWith(ORG_ID);
    });
  });

  describe('revocar', () => {
    it('borra el entitlement de la org', async () => {
      const { service, repo } = makeService();
      repo.revocar.mockResolvedValue(undefined);

      await service.revocar(ORG_ID, PACK_ID);

      expect(repo.revocar).toHaveBeenCalledWith(ORG_ID, PACK_ID);
    });

    it('invalida el cache org-packs:<id> tras revocar', async () => {
      const { service, repo, redis } = makeService();
      repo.revocar.mockResolvedValue(undefined);

      await service.revocar(ORG_ID, PACK_ID);

      expect(redis.del).toHaveBeenCalledWith(CACHE_KEY);
    });
  });

  describe('habilitarParaOrg (resolución packId | clave)', () => {
    it('resuelve por packId y delega en habilitar', async () => {
      const { service, repo, catalog } = makeService({
        vertical: makeVerticalMock('CONTABILIDAD'),
      });
      catalog.findById.mockResolvedValue(makePack({ verticalAplicable: 'CONTABILIDAD' }));
      repo.habilitar.mockResolvedValue(makeEntitlementRow());

      await service.habilitarParaOrg(ORG_ID, { packId: PACK_ID }, USER_ID);

      expect(catalog.findById).toHaveBeenCalledWith(PACK_ID);
      expect(repo.habilitar).toHaveBeenCalledWith(ORG_ID, PACK_ID, USER_ID);
    });

    it('resuelve por clave → packId y delega en habilitar', async () => {
      const { service, repo, catalog } = makeService({
        vertical: makeVerticalMock('CONTABILIDAD'),
      });
      catalog.findByClave.mockResolvedValue(makePack({ verticalAplicable: 'CONTABILIDAD' }));
      catalog.findById.mockResolvedValue(makePack({ verticalAplicable: 'CONTABILIDAD' }));
      repo.habilitar.mockResolvedValue(makeEntitlementRow());

      await service.habilitarParaOrg(ORG_ID, { clave: CLAVE }, USER_ID);

      expect(catalog.findByClave).toHaveBeenCalledWith(CLAVE);
      expect(repo.habilitar).toHaveBeenCalledWith(ORG_ID, PACK_ID, USER_ID);
    });

    it('rechaza con PackNoEncontradoError si la clave no existe en el catálogo', async () => {
      const { service, repo, catalog } = makeService();
      catalog.findByClave.mockResolvedValue(null);

      await expect(
        service.habilitarParaOrg(ORG_ID, { clave: 'no.existe' }, USER_ID),
      ).rejects.toBeInstanceOf(PackNoEncontradoError);
      expect(repo.habilitar).not.toHaveBeenCalled();
    });
  });

  describe('packsActivos', () => {
    it('delega en el repositorio las claves activas de la org', async () => {
      const { service, repo } = makeService();
      repo.findClavesActivasByOrg.mockResolvedValue([CLAVE]);

      expect(await service.packsActivos(ORG_ID)).toEqual([CLAVE]);
      expect(repo.findClavesActivasByOrg).toHaveBeenCalledWith(ORG_ID);
    });
  });

  describe('listarCatalogo', () => {
    it('devuelve el catálogo de packs activos', async () => {
      const { service, catalog } = makeService();
      const packs = [makePack()];
      catalog.listar.mockResolvedValue(packs);

      expect(await service.listarCatalogo()).toBe(packs);
    });
  });

  // ==========================================================
  // otorgarPacksPorDefecto (auto-otorgamiento, design conciliacion-bancaria §7.2)
  // ==========================================================
  describe('otorgarPacksPorDefecto', () => {
    const FAKE_TX = { $fakeTransactionClient: true } as unknown as Prisma.TransactionClient;

    it('habilita+activa (activo:true, tx) cada pack otorgadoPorDefecto del vertical, dentro de la TX', async () => {
      const { service, repo, catalog } = makeService();
      const packA = makePack({ id: 'pack-a', clave: 'contabilidad.conciliacion' });
      const packB = makePack({ id: 'pack-b', clave: 'contabilidad.adjuntos' });
      catalog.listarOtorgadosPorDefecto.mockResolvedValue([packA, packB]);
      repo.habilitar.mockResolvedValue(makeEntitlementRow({ activo: true }));

      const claves = await service.otorgarPacksPorDefecto(ORG_ID, 'CONTABILIDAD', USER_ID, FAKE_TX);

      expect(catalog.listarOtorgadosPorDefecto).toHaveBeenCalledWith('CONTABILIDAD');
      expect(repo.habilitar).toHaveBeenCalledWith(ORG_ID, 'pack-a', USER_ID, {
        activo: true,
        tx: FAKE_TX,
      });
      expect(repo.habilitar).toHaveBeenCalledWith(ORG_ID, 'pack-b', USER_ID, {
        activo: true,
        tx: FAKE_TX,
      });
      expect(claves).toEqual(['contabilidad.conciliacion', 'contabilidad.adjuntos']);
    });

    it('NO llama this.orgVertical.verticalDe (recibe el vertical como parámetro — design §7.1/§7.2)', async () => {
      const { service, catalog, vertical } = makeService();
      catalog.listarOtorgadosPorDefecto.mockResolvedValue([]);

      await service.otorgarPacksPorDefecto(ORG_ID, 'CONTABILIDAD', USER_ID, FAKE_TX);

      expect(vertical.verticalDe).not.toHaveBeenCalled();
    });

    it('NO invalida el cache Redis dentro de la función (efecto externo prohibido dentro de una TX)', async () => {
      const { service, catalog, repo, redis } = makeService();
      catalog.listarOtorgadosPorDefecto.mockResolvedValue([makePack()]);
      repo.habilitar.mockResolvedValue(makeEntitlementRow({ activo: true }));

      await service.otorgarPacksPorDefecto(ORG_ID, 'CONTABILIDAD', USER_ID, FAKE_TX);

      expect(redis.del).not.toHaveBeenCalled();
    });

    it('sin packs otorgadoPorDefecto para el vertical → no llama habilitar, devuelve []', async () => {
      const { service, repo, catalog } = makeService();
      catalog.listarOtorgadosPorDefecto.mockResolvedValue([]);

      const claves = await service.otorgarPacksPorDefecto(ORG_ID, 'CONTABILIDAD', USER_ID, FAKE_TX);

      expect(repo.habilitar).not.toHaveBeenCalled();
      expect(claves).toEqual([]);
    });
  });

  // ==========================================================
  // invalidarCacheDeOrg (método público nuevo, design §7.2/§7.3)
  // ==========================================================
  describe('invalidarCacheDeOrg', () => {
    it('llama redis.del con la clave org-packs:<orgId>', async () => {
      const { service, redis } = makeService();

      await service.invalidarCacheDeOrg(ORG_ID);

      expect(redis.del).toHaveBeenCalledWith(`org-packs:${ORG_ID}`);
    });
  });
});
