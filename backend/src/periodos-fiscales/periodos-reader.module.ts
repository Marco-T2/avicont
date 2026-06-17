import { Module } from '@nestjs/common';

import { PrismaService } from '@/common/prisma.service';
import { TenantContextService } from '@/common/tenant-context/tenant-context.service';

import { PrismaGestionStatusReaderAdapter } from './adapters/prisma-gestion-status-reader.adapter';
import { PrismaPeriodosReaderAdapter } from './adapters/prisma-periodos-reader.adapter';
import { GESTION_STATUS_READER_PORT } from './ports/gestion-status-reader.port';
import { PERIODOS_READER_PORT } from './ports/periodos-reader.port';

// Módulo-puerto cross-módulo: expone los bindings de lectura cross-módulo de
// periodos-fiscales (`PERIODOS_READER_PORT` + `GESTION_STATUS_READER_PORT`,
// consumidos por `comprobantes`). Vive separado de `PeriodosFiscalesModule`
// para que `comprobantes` lo importe sin tirar del require de
// `periodos-fiscales.module.ts` — eso cerraba el ciclo de carga CJS en el build
// de prod (ciclo comprobantes↔periodos). Por eso el GESTION_STATUS_READER_PORT
// (consumido por comprobantes para bloquear anulación de cierre con gestión
// CERRADA, REQ-CMP-SYS-06) se registra ACÁ y NO en periodos-fiscales.module.ts.
@Module({
  providers: [
    PrismaService,
    TenantContextService,
    PrismaPeriodosReaderAdapter,
    { provide: PERIODOS_READER_PORT, useExisting: PrismaPeriodosReaderAdapter },
    PrismaGestionStatusReaderAdapter,
    { provide: GESTION_STATUS_READER_PORT, useExisting: PrismaGestionStatusReaderAdapter },
  ],
  exports: [PERIODOS_READER_PORT, GESTION_STATUS_READER_PORT],
})
export class PeriodosReaderModule {}
