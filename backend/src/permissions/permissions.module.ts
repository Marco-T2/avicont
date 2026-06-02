import { Module } from '@nestjs/common';

import { PacksModule } from '../packs/pack.module';
import { CatalogoAsignableResolver } from './catalogo-asignable.resolver';
import { PermissionsController } from './permissions.controller';

@Module({
  // PacksModule exporta los puertos (vertical, packs activos, catálogo de packs)
  // que el resolver del catálogo asignable consume cross-módulo (core §3.7).
  imports: [PacksModule],
  controllers: [PermissionsController],
  providers: [CatalogoAsignableResolver],
  // Exporta el resolver para que CustomRolesModule monte el mismo candado en
  // validatePermissions (server-authoritative, defense in depth).
  exports: [CatalogoAsignableResolver],
})
export class PermissionsModule {}
