import { Inject, Injectable } from '@nestjs/common';

import { RedisService } from '@/cache/redis.service';

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
 *
 * Toda mutación de entitlement/activación invalida el cache `org-packs:<id>`
 * (Redis, TTL 300s del `PackEnabledGuard`) para que el guard y `/me/permissions`
 * reflejen el cambio en caliente, sin esperar el TTL — mismo patrón que
 * `actualizarStatus` con `org-status:<id>` (org-status-enforcement).
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
    private readonly redis: RedisService,
  ) {}

  /** Clave del cache Redis de packs activos de la org (espejo del PackEnabledGuard). */
  private cacheKey(organizationId: string): string {
    return `org-packs:${organizationId}`;
  }

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
   * Habilita un pack para una org resolviendo la referencia (`packId` o `clave`).
   * Punto de entrada del super-admin (`POST /admin/platform/orgs/:id/packs`): el
   * panel puede enviar el id directo o la clave estable del catálogo.
   */
  async habilitarParaOrg(
    organizationId: string,
    ref: { packId?: string; clave?: string },
    habilitadoPorUserId: string,
  ): Promise<OrgPackEntitlementRow> {
    const packId = await this.resolverPackId(ref);
    return this.habilitar(organizationId, packId, habilitadoPorUserId);
  }

  /**
   * Habilita un pack para una org (entitlement, `activo = false`). Valida que el
   * `verticalAplicable` del pack coincida con el vertical de la org — un pack NO
   * rompe la exclusividad de vertical (§8 diseño, §10.4 core). Invalida el cache.
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

    const entitlement = await this.repo.habilitar(organizationId, packId, habilitadoPorUserId);
    await this.redis.del(this.cacheKey(organizationId));
    return entitlement;
  }

  /** Revoca el entitlement (borra la fila → revoca también la activación). Invalida el cache. */
  async revocar(organizationId: string, packId: string): Promise<void> {
    await this.repo.revocar(organizationId, packId);
    await this.redis.del(this.cacheKey(organizationId));
  }

  /**
   * Activa/desactiva un pack de la org activa por su `clave` estable. Punto de
   * entrada del Owner (`PATCH /packs/:clave`): el front conoce la clave, no el id.
   * Resuelve clave → packId (404 `PACK_NO_ENCONTRADO` si no está en el catálogo)
   * y delega en `activar`, que enforza la frontera activación⊆entitlement (§4.5).
   */
  async activarPorClave(
    organizationId: string,
    clave: string,
    activo: boolean,
  ): Promise<OrgPackEntitlementRow> {
    const pack = await this.catalog.findByClave(clave);
    if (pack === null) {
      throw new PackNoEncontradoError({ clave });
    }
    return this.activar(organizationId, pack.id, activo);
  }

  /**
   * Lista los packs habilitados de la org activa con su estado de activación,
   * para que el Owner sepa qué puede prender/apagar (`GET /packs/mis-packs`).
   */
  listarMisPacks(organizationId: string): Promise<OrgPackEntitlementConPack[]> {
    return this.repo.findByOrg(organizationId);
  }

  /** Resuelve `packId` o `clave` a un packId del catálogo (404 si no existe). */
  private async resolverPackId(ref: { packId?: string; clave?: string }): Promise<string> {
    if (ref.packId !== undefined) {
      return ref.packId;
    }
    if (ref.clave !== undefined) {
      const pack = await this.catalog.findByClave(ref.clave);
      if (pack === null) {
        throw new PackNoEncontradoError({ clave: ref.clave });
      }
      return pack.id;
    }
    throw new PackNoEncontradoError({ clave: '' });
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
    const updated = await this.repo.setActivo(organizationId, packId, activo);
    await this.redis.del(this.cacheKey(organizationId));
    return updated;
  }
}
