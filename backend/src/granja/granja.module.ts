import { Module } from '@nestjs/common';

import { PrismaService } from '@/common/prisma.service';

import { PrismaLoteRepository } from './adapters/prisma-lote.repository';
import { PrismaTipoRegistroRepository } from './adapters/prisma-tipo-registro.repository';
import { PrismaTipoRegistroSeederAdapter } from './adapters/prisma-tipo-registro-seeder.adapter';
import { LOTE_REPOSITORY_PORT } from './ports/lote.repository.port';
import { TIPO_REGISTRO_REPOSITORY_PORT } from './ports/tipo-registro.repository.port';
import { TIPO_REGISTRO_SEEDER_PORT } from './ports/tipo-registro-seeder.port';
import { LoteService } from './lote.service';
import { TipoRegistroService } from './tipo-registro.service';

/**
 * Módulo Granja — vertical operativo para engorde de pollos parrilleros.
 *
 * Versión base (S3): contiene adapters CRUD + services.
 * Controllers y seed wiring en TenantsService se agregan en S5.
 *
 * Exporta TIPO_REGISTRO_SEEDER_PORT para que TenantsModule lo consuma
 * al activar el vertical Granja (S5, CLAUDE.md §3.7 y design.md §8).
 */
@Module({
  providers: [
    PrismaService,

    // Adapter Lote
    PrismaLoteRepository,
    {
      provide: LOTE_REPOSITORY_PORT,
      useExisting: PrismaLoteRepository,
    },

    // Adapter TipoRegistro
    PrismaTipoRegistroRepository,
    {
      provide: TIPO_REGISTRO_REPOSITORY_PORT,
      useExisting: PrismaTipoRegistroRepository,
    },

    // Seeder adapter (depende de TIPO_REGISTRO_REPOSITORY_PORT)
    PrismaTipoRegistroSeederAdapter,
    {
      provide: TIPO_REGISTRO_SEEDER_PORT,
      useExisting: PrismaTipoRegistroSeederAdapter,
    },

    // Services
    LoteService,
    TipoRegistroService,
  ],
  exports: [
    // Exportado para TenantsModule (seed al activar granja)
    TIPO_REGISTRO_SEEDER_PORT,
  ],
})
export class GranjaModule {}
