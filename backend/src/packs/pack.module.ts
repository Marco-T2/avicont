import { Module } from '@nestjs/common';

import { PrismaService } from '@/common/prisma.service';
import { TenantContextService } from '@/common/tenant-context/tenant-context.service';

import { PrismaOrgPackRepository } from './adapters/prisma-org-pack.repository';
import { PrismaOrgVerticalReader } from './adapters/prisma-org-vertical.reader';
import { PrismaPackCatalogReader } from './adapters/prisma-pack-catalog.reader';
import { ORG_PACK_REPOSITORY_PORT } from './ports/org-pack.repository.port';
import { ORG_PACKS_READER_PORT } from './ports/org-packs.reader.port';
import { ORG_VERTICAL_READER_PORT } from './ports/org-vertical.reader.port';
import { PACK_CATALOG_READER_PORT } from './ports/pack-catalog.reader.port';
import { PackService } from './pack.service';

/**
 * Módulo del riel de packs (eje 2). Provee el catálogo, el repositorio de
 * entitlement/activación y el service.
 *
 * Exporta `ORG_PACKS_READER_PORT` (token de `OrgPacksReaderPort`): la superficie
 * pública que OTROS módulos consumen (el `PackEnabledGuard`, `/me/permissions`,
 * el filtrado RBAC) sin importar `packs/adapters/` (core §3.3/§3.7). También
 * exporta `PackService` y el catálogo para los controllers de slices posteriores.
 */
@Module({
  providers: [
    PrismaService,
    // PrismaService depende de TenantContextService (mismo patrón que granja y
    // el resto de módulos con repositorios Prisma).
    TenantContextService,

    // Catálogo global (read-only)
    PrismaPackCatalogReader,
    { provide: PACK_CATALOG_READER_PORT, useExisting: PrismaPackCatalogReader },

    // Repositorio de entitlement + activación (implementa también OrgPacksReaderPort)
    PrismaOrgPackRepository,
    { provide: ORG_PACK_REPOSITORY_PORT, useExisting: PrismaOrgPackRepository },
    { provide: ORG_PACKS_READER_PORT, useExisting: PrismaOrgPackRepository },

    // Reader del vertical de la org (para validar la frontera packs↔vertical)
    PrismaOrgVerticalReader,
    { provide: ORG_VERTICAL_READER_PORT, useExisting: PrismaOrgVerticalReader },

    PackService,
  ],
  exports: [
    // Superficie pública cross-módulo: packs activos de una org (eje 2).
    ORG_PACKS_READER_PORT,
    // Consumidos por los controllers de entitlement/activación (slices 5/6).
    PackService,
    PACK_CATALOG_READER_PORT,
    ORG_PACK_REPOSITORY_PORT,
  ],
})
export class PacksModule {}
