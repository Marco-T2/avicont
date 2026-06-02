import type { VerticalPack } from '@prisma/client';

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

// ============================================================
// Fixtures y mocks
// ============================================================

const ORG_ID = 'org-1';
const USER_ID = 'user-1';
const PACK_ID = 'pack-1';
const CLAVE = 'contabilidad.adjuntos';

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
  };
}

function makeVerticalMock(vertical: VerticalPack | null = 'CONTABILIDAD'): MockVertical {
  return { verticalDe: jest.fn().mockResolvedValue(vertical) };
}

function makeService(deps?: { repo?: MockRepo; catalog?: MockCatalog; vertical?: MockVertical }): {
  service: PackService;
  repo: MockRepo;
  catalog: MockCatalog;
  vertical: MockVertical;
} {
  const repo = deps?.repo ?? makeRepoMock();
  const catalog = deps?.catalog ?? makeCatalogMock();
  const vertical = deps?.vertical ?? makeVerticalMock();
  const service = new PackService(catalog, repo, vertical);
  return { service, repo, catalog, vertical };
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

    it('rechaza con PackNoHabilitadoError al activar sin entitlement', async () => {
      const { service, repo } = makeService();
      repo.findByOrgYPack.mockResolvedValue(null);

      await expect(service.activar(ORG_ID, PACK_ID, true)).rejects.toBeInstanceOf(
        PackNoHabilitadoError,
      );
      expect(repo.setActivo).not.toHaveBeenCalled();
    });
  });

  describe('revocar', () => {
    it('borra el entitlement de la org', async () => {
      const { service, repo } = makeService();
      repo.revocar.mockResolvedValue(undefined);

      await service.revocar(ORG_ID, PACK_ID);

      expect(repo.revocar).toHaveBeenCalledWith(ORG_ID, PACK_ID);
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
});
