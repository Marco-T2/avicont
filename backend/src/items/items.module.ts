import { Module } from '@nestjs/common';

import { PrismaService } from '@/common/prisma.service';
import { TenantContextService } from '@/common/tenant-context/tenant-context.service';
import { CuentasModule } from '@/cuentas/cuentas.module';
import { RbacModule } from '@/rbac/rbac.module';

import { PrismaItemsReaderAdapter } from './adapters/prisma-items-reader.adapter';
import { PrismaItemsRepository } from './adapters/prisma-items.repository';
import { ItemsController } from './items.controller';
import { ItemsService } from './items.service';
import { ITEMS_READER_PORT } from './ports/items-reader.port';
import { ITEMS_REPOSITORY_PORT } from './ports/items.repository.port';

// Catálogo de ítems vendibles (change `ventas-piloto`, Fase 3). Módulo propio
// compartido: el CRUD es rico, lo compartido es un port de dos campos (D-15).
//
// `CUENTAS_READER_PORT` entra por `CuentasModule` (§3.7 — port para lectura
// síncrona cross-módulo): se usa para validar que la `cuentaIngresoId` del
// ítem exista EN EL TENANT, sea de detalle y esté activa. La FK no alcanza
// para el primer chequeo, porque una cuenta de otra organización también es
// una fila válida de `cuentas`.
//
// `ITEMS_READER_PORT` se exporta para que `ventas` valide los `itemId` de las
// líneas sin acoplarse al repositorio completo.
@Module({
  imports: [RbacModule, CuentasModule],
  controllers: [ItemsController],
  providers: [
    PrismaService,
    TenantContextService,
    ItemsService,

    PrismaItemsRepository,
    { provide: ITEMS_REPOSITORY_PORT, useExisting: PrismaItemsRepository },

    PrismaItemsReaderAdapter,
    { provide: ITEMS_READER_PORT, useExisting: PrismaItemsReaderAdapter },
  ],
  exports: [ItemsService, ITEMS_READER_PORT],
})
export class ItemsModule {}
