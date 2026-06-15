import { Module } from '@nestjs/common';

import { PrismaService } from '@/common/prisma.service';
import { TenantContextService } from '@/common/tenant-context/tenant-context.service';
import { CuentasReaderModule } from '@/cuentas/cuentas-reader.module';
import { PeriodosReaderModule } from '@/periodos-fiscales/periodos-reader.module';
import { RbacModule } from '@/rbac/rbac.module';

import { PrismaEeffSaldosReaderAdapter } from './adapters/prisma-eeff-saldos-reader.adapter';
import { PrismaComprobantesReaderAdapter } from './adapters/prisma-comprobantes-reader.adapter';
import { PrismaLibroMayorReaderAdapter } from './adapters/prisma-libro-mayor-reader.adapter';
import { BalanceComprobacionService } from './balance-comprobacion.service';
import { BalanceGeneralService } from './balance-general.service';
import { EstadoResultadosService } from './estado-resultados.service';
import { HojaTrabajoService } from './hoja-trabajo.service';
import { EeffController } from './eeff.controller';
import { LibroDiarioService } from './libro-diario.service';
import { LibroMayorService } from './libro-mayor.service';
import { EEFF_SALDOS_READER_PORT } from './ports/eeff-saldos-reader.port';
import { COMPROBANTES_READER_PORT } from './ports/comprobantes-reader.port';
import { LIBRO_MAYOR_READER_PORT } from './ports/libro-mayor-reader.port';
import { ReportesController } from './reportes.controller';

/**
 * Módulo `reportes` — capabilities Libro Diario + Libro Mayor + Balance General +
 * Estado de Resultados + Balance de Comprobación + Hoja de Trabajo de 12 Columnas (EEFF).
 *
 * DI:
 *   - `ComprobantesReaderPort` → `PrismaComprobantesReaderAdapter` (Diario)
 *   - `LibroMayorReaderPort` → `PrismaLibroMayorReaderAdapter` (Mayor, $queryRaw JOIN)
 *   - `EeffSaldosReaderPort` → `PrismaEeffSaldosReaderAdapter` (Balance + Estado Resultados
 *     + Balance de Comprobación + Hoja de Trabajo, $queryRaw GROUP BY + findMany)
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
    // CuentasReaderModule expone CUENTAS_READER_LOOKUP_PORT para validar la cuenta
    // del filtro del Libro Diario. Leaf module — NO importar CuentasModule (riesgo
    // de ciclo CJS prod, memoria prod-build-crash-ciclos).
    CuentasReaderModule,
  ],
  controllers: [ReportesController, EeffController],
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

    // Service + Adapter EEFF (Balance + Estado Resultados + Balance de Comprobación
    // + Hoja de Trabajo): $queryRaw GROUP BY saldos + findMany estructura.
    // Todos reusan EEFF_SALDOS_READER_PORT sin adapter nuevo.
    BalanceGeneralService,
    EstadoResultadosService,
    BalanceComprobacionService,
    HojaTrabajoService,
    PrismaEeffSaldosReaderAdapter,
    {
      provide: EEFF_SALDOS_READER_PORT,
      useExisting: PrismaEeffSaldosReaderAdapter,
    },
  ],
})
export class ReportesModule {}
