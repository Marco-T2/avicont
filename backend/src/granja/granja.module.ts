import { Module } from '@nestjs/common';

import { ClockModule } from '@/common/clock/clock.module';
import { PrismaService } from '@/common/prisma.service';

import { PrismaLoteRepository } from './adapters/prisma-lote.repository';
import { PrismaLoteResumenReader } from './adapters/prisma-lote-resumen.reader';
import { PrismaMovimientoRepository } from './adapters/prisma-movimiento.repository';
import { PrismaTipoRegistroRepository } from './adapters/prisma-tipo-registro.repository';
import { PrismaTipoRegistroSeederAdapter } from './adapters/prisma-tipo-registro-seeder.adapter';
import { LOTE_RESUMEN_READER_PORT } from './ports/lote-resumen-reader.port';
import { LOTE_REPOSITORY_PORT } from './ports/lote.repository.port';
import { MOVIMIENTO_REPOSITORY_PORT } from './ports/movimiento.repository.port';
import { TIPO_REGISTRO_REPOSITORY_PORT } from './ports/tipo-registro.repository.port';
import { TIPO_REGISTRO_SEEDER_PORT } from './ports/tipo-registro-seeder.port';
import { DashboardService } from './dashboard.service';
import { LoteService } from './lote.service';
import { MovimientoService } from './movimiento.service';
import { TipoRegistroService } from './tipo-registro.service';

/**
 * Módulo Granja — vertical operativo para engorde de pollos parrilleros.
 *
 * Versión S4: contiene adapters CRUD + services + read-model + movimientos.
 * Controllers y seed wiring en TenantsService se agregan en S5.
 *
 * Exporta TIPO_REGISTRO_SEEDER_PORT para que TenantsModule lo consuma
 * al activar el vertical Granja (S5, CLAUDE.md §3.7 y design.md §8).
 */
@Module({
  imports: [ClockModule],
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

    // Adapter Movimiento (S4)
    PrismaMovimientoRepository,
    {
      provide: MOVIMIENTO_REPOSITORY_PORT,
      useExisting: PrismaMovimientoRepository,
    },

    // Read-model batch (S4)
    PrismaLoteResumenReader,
    {
      provide: LOTE_RESUMEN_READER_PORT,
      useExisting: PrismaLoteResumenReader,
    },

    // Services
    LoteService,
    TipoRegistroService,
    MovimientoService,
    DashboardService,
  ],
  exports: [
    // Exportado para TenantsModule (seed al activar granja)
    TIPO_REGISTRO_SEEDER_PORT,
    // Exportado para S5 (controllers inyectan services)
    LoteService,
    TipoRegistroService,
    MovimientoService,
    DashboardService,
  ],
})
export class GranjaModule {}
