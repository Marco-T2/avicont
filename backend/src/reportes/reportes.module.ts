import { Module } from '@nestjs/common';

import { PrismaService } from '@/common/prisma.service';
import { TenantContextService } from '@/common/tenant-context/tenant-context.service';
import { PeriodosReaderModule } from '@/periodos-fiscales/periodos-reader.module';
import { RbacModule } from '@/rbac/rbac.module';

import { PrismaComprobantesReaderAdapter } from './adapters/prisma-comprobantes-reader.adapter';
import { LibroDiarioService } from './libro-diario.service';
import { COMPROBANTES_READER_PORT } from './ports/comprobantes-reader.port';
import { ReportesController } from './reportes.controller';

/**
 * Módulo `reportes` — capability Libro Diario (MVP).
 *
 * DI:
 *   - `ComprobantesReaderPort` → `PrismaComprobantesReaderAdapter` (propio)
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

    // Adapter propio: ComprobantesReaderPort lee comprobantes para el libro diario.
    // Separado del ComprobanteRepository de comprobantes.module (que maneja CRUD).
    PrismaComprobantesReaderAdapter,
    {
      provide: COMPROBANTES_READER_PORT,
      useExisting: PrismaComprobantesReaderAdapter,
    },
  ],
})
export class ReportesModule {}
