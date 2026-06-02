import { Inject, Injectable } from '@nestjs/common';

import type { ContextoAsignable } from '@/common/permisos/catalogo-asignable';
import { ORG_PACKS_READER_PORT, OrgPacksReaderPort } from '@/packs/ports/org-packs.reader.port';
import {
  ORG_VERTICAL_READER_PORT,
  OrgVerticalReaderPort,
} from '@/packs/ports/org-vertical.reader.port';
import {
  PACK_CATALOG_READER_PORT,
  PackCatalogReaderPort,
} from '@/packs/ports/pack-catalog.reader.port';

/**
 * Resuelve el `ContextoAsignable` de una org (su vertical activo + las claves de
 * packs del catálogo + los packs activos) cruzando la frontera del módulo
 * `packs/` SOLO vía puertos (core §3.7). Lo consumen tanto el endpoint del
 * catálogo asignable (UX) como `CustomRolesService.validatePermissions` (el
 * candado). Centralizar la resolución acá evita duplicar el wiring de puertos.
 */
@Injectable()
export class CatalogoAsignableResolver {
  constructor(
    @Inject(ORG_VERTICAL_READER_PORT)
    private readonly orgVertical: OrgVerticalReaderPort,
    @Inject(ORG_PACKS_READER_PORT)
    private readonly orgPacks: OrgPacksReaderPort,
    @Inject(PACK_CATALOG_READER_PORT)
    private readonly packCatalog: PackCatalogReaderPort,
  ) {}

  async resolver(organizationId: string): Promise<ContextoAsignable> {
    // El catálogo de packs incluye los inactivos del catálogo global: un pack
    // retirado del catálogo (`activo=false`) sigue siendo "clave de pack" a
    // efectos del filtro (su submódulo no es core del vertical). Lo que decide
    // la asignabilidad es si está en los packs ACTIVOS de la org, no el flag
    // global del catálogo.
    const [vertical, catalogoPacks, packsActivos] = await Promise.all([
      this.orgVertical.verticalDe(organizationId),
      this.packCatalog.listar({ incluirInactivos: true }),
      this.orgPacks.packsActivos(organizationId),
    ]);

    return {
      vertical,
      packsCatalogo: catalogoPacks.map((p) => p.clave),
      packsActivos,
    };
  }
}
