import { Module } from '@nestjs/common';

import { PrismaService } from '@/common/prisma.service';
import { TenantContextService } from '@/common/tenant-context/tenant-context.service';

import { PrismaPeriodosReaderAdapter } from './adapters/prisma-periodos-reader.adapter';
import { PERIODOS_READER_PORT } from './ports/periodos-reader.port';

// Módulo-puerto cross-módulo: expone SOLO el binding de `PERIODOS_READER_PORT`
// (consumido por `comprobantes` para resolver periodoFiscalId desde la fecha).
// Vive separado de `PeriodosFiscalesModule` para que `comprobantes` lo importe
// sin tirar del require de `periodos-fiscales.module.ts` — eso cerraba el ciclo
// de carga CJS en el build de prod (ciclo comprobantes↔periodos).
@Module({
  providers: [
    PrismaService,
    TenantContextService,
    PrismaPeriodosReaderAdapter,
    { provide: PERIODOS_READER_PORT, useExisting: PrismaPeriodosReaderAdapter },
  ],
  exports: [PERIODOS_READER_PORT],
})
export class PeriodosReaderModule {}
