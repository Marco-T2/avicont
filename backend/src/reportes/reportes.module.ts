import { Module } from '@nestjs/common';

import { PrismaService } from '@/common/prisma.service';
import { TenantContextService } from '@/common/tenant-context/tenant-context.service';
import { PeriodosReaderModule } from '@/periodos-fiscales/periodos-reader.module';
import { RbacModule } from '@/rbac/rbac.module';

import { PrismaComprobantesReaderAdapter } from './adapters/prisma-comprobantes-reader.adapter';
import { PrismaLibroMayorReaderAdapter } from './adapters/prisma-libro-mayor-reader.adapter';
import { LibroDiarioService } from './libro-diario.service';
import { LibroMayorService } from './libro-mayor.service';
import { COMPROBANTES_READER_PORT } from './ports/comprobantes-reader.port';
import { LIBRO_MAYOR_READER_PORT } from './ports/libro-mayor-reader.port';
import { ReportesController } from './reportes.controller';

/**
 * Módulo `reportes` — capabilities Libro Diario + Libro Mayor.
 *
 * DI:
 *   - `ComprobantesReaderPort` → `PrismaComprobantesReaderAdapter` (Diario)
 *   - `LibroMayorReaderPort` → `PrismaLibroMayorReaderAdapter` (Mayor, $queryRaw JOIN)
 *   - `PeriodosReaderPort` → importado de `PeriodosReaderModule` (leaf module §3.7)
 *   - `RbacModule` → guards de permisos
 *
 * Sin ciclos: reportes importa PeriodosReaderModule (hoja), no PeriodosFiscalesModule.
 */
@Module({
  imports: [
    RbacModule,
    // PeriodosReaderModule expone PERIODOS_READER_PORT sin traer el módulo completo
    // (mismo patrón que ComprobantesModule — evita ciclos de carga CJS en prod).
    PeriodosReaderModule,
  ],
  controllers: [ReportesController],
  providers: [
    PrismaService,
    TenantContextService,
    LibroDiarioService,

    // Adapter Libro Diario: ComprobantesReaderPort lee comprobantes con findMany.
    PrismaComprobantesReaderAdapter,
    {
      provide: COMPROBANTES_READER_PORT,
      useExisting: PrismaComprobantesReaderAdapter,
    },

    // Service + Adapter Libro Mayor: $queryRaw JOIN para saldo inicial + movimientos.
    LibroMayorService,
    PrismaLibroMayorReaderAdapter,
    {
      provide: LIBRO_MAYOR_READER_PORT,
      useExisting: PrismaLibroMayorReaderAdapter,
    },
  ],
})
export class ReportesModule {}
