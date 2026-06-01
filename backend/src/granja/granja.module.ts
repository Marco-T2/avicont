import { Module } from '@nestjs/common';

import { ClockModule } from '@/common/clock/clock.module';
import { PrismaService } from '@/common/prisma.service';
import { TenantContextService } from '@/common/tenant-context/tenant-context.service';
import { RbacModule } from '@/rbac/rbac.module';

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
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { LotesController } from './lotes.controller';
import { LoteService } from './lote.service';
import { MovimientoService } from './movimiento.service';
import { TipoRegistroService } from './tipo-registro.service';
import { TiposRegistroController } from './tipos-registro.controller';

/**
 * Módulo Granja — vertical operativo para engorde de pollos parrilleros.
 *
 * Versión S5: adapters CRUD + services + read-model + movimientos + los 3
 * controllers HTTP (lotes, tipos-registro, dashboard) con gating de módulo
 * (@RequireModule('granja')) y RBAC. Importa RbacModule para PermissionsGuard.
 *
 * Exporta TIPO_REGISTRO_SEEDER_PORT para que TenantsModule lo consuma
 * al activar el vertical Granja (S5, CLAUDE.md §3.7 y design.md §8).
 */
@Module({
  imports: [ClockModule, RbacModule],
  controllers: [LotesController, TiposRegistroController, DashboardController],
  providers: [
    PrismaService,
    // PrismaService depende de TenantContextService (mismo patrón que el resto
    // de módulos con controllers, ej. tipos-documento-fisico).
    TenantContextService,

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
