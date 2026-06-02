import { Inject, Injectable } from '@nestjs/common';

import type { Pack } from './domain/pack';
import {
  PackNoEncontradoError,
  PackNoHabilitadoError,
  PackVerticalNoAplicableError,
} from './domain/pack-errors';
import {
  ORG_PACK_REPOSITORY_PORT,
  OrgPackRepositoryPort,
  type OrgPackEntitlementConPack,
  type OrgPackEntitlementRow,
} from './ports/org-pack.repository.port';
import { ORG_VERTICAL_READER_PORT, OrgVerticalReaderPort } from './ports/org-vertical.reader.port';
import { PACK_CATALOG_READER_PORT, PackCatalogReaderPort } from './ports/pack-catalog.reader.port';

/**
 * Lógica del riel de packs (eje 2). Coordina catálogo, entitlement y activación
 * respetando las cuatro reglas del diseño (`docs/disenos/packs-eje2.md` §6):
 * frontera activación⊆entitlement (§4.5) y exclusividad de vertical (§8).
 *
 * Sin `new Date()` (core §4.6): los timestamps los pone Prisma (`@default(now())`,
 * `@updatedAt`); el service no maneja fechas de dominio.
 */
@Injectable()
export class PackService {
  constructor(
    @Inject(PACK_CATALOG_READER_PORT)
    private readonly catalog: PackCatalogReaderPort,
    @Inject(ORG_PACK_REPOSITORY_PORT)
    private readonly repo: OrgPackRepositoryPort,
    @Inject(ORG_VERTICAL_READER_PORT)
    private readonly orgVertical: OrgVerticalReaderPort,
  ) {}

  /** Lista el catálogo de packs activos (vendibles). */
  listarCatalogo(): Promise<Pack[]> {
    return this.catalog.listar();
  }

  /** Lista los entitlements de una org con su pack (para paneles de administración). */
  listarEntitlementsDeOrg(organizationId: string): Promise<OrgPackEntitlementConPack[]> {
    return this.repo.findByOrg(organizationId);
  }

  /** Claves de los packs activos de la org (superficie de lectura). */
  packsActivos(organizationId: string): Promise<string[]> {
    return this.repo.findClavesActivasByOrg(organizationId);
  }

  /**
   * Habilita un pack para una org (entitlement, `activo = false`). Valida que el
   * `verticalAplicable` del pack coincida con el vertical de la org — un pack NO
   * rompe la exclusividad de vertical (§8 diseño, §10.4 core).
   */
  async habilitar(
    organizationId: string,
    packId: string,
    habilitadoPorUserId: string,
  ): Promise<OrgPackEntitlementRow> {
    const pack = await this.catalog.findById(packId);
    if (pack === null) {
      throw new PackNoEncontradoError({ id: packId });
    }

    const verticalOrg = await this.orgVertical.verticalDe(organizationId);
    if (verticalOrg === null || pack.verticalAplicable !== verticalOrg) {
      throw new PackVerticalNoAplicableError({
        packClave: pack.clave,
        verticalPack: pack.verticalAplicable,
        verticalOrg: verticalOrg ?? 'NINGUNO',
      });
    }

    return this.repo.habilitar(organizationId, packId, habilitadoPorUserId);
  }

  /** Revoca el entitlement (borra la fila → revoca también la activación). */
  revocar(organizationId: string, packId: string): Promise<void> {
    return this.repo.revocar(organizationId, packId);
  }

  /**
   * Activa/desactiva un pack YA habilitado. Enforcea la frontera de oro (§4.5):
   * sin fila de entitlement → `PackNoHabilitadoError` (403). La estructura del
   * modelo ya lo garantiza (no hay fila sobre la que setear `activo`); este
   * chequeo es el lado friendly del defense in depth (§4.8 core).
   */
  async activar(
    organizationId: string,
    packId: string,
    activo: boolean,
  ): Promise<OrgPackEntitlementRow> {
    const entitlement = await this.repo.findByOrgYPack(organizationId, packId);
    if (entitlement === null) {
      throw new PackNoHabilitadoError(packId);
    }
    return this.repo.setActivo(organizationId, packId, activo);
  }
}
