import { Module } from '@nestjs/common';

import { PrismaService } from '@/common/prisma.service';
import { TenantContextService } from '@/common/tenant-context/tenant-context.service';

import { PrismaCuentasReaderLookupAdapter } from './adapters/prisma-cuentas-reader-lookup.adapter';
import { CUENTAS_READER_LOOKUP_PORT } from './ports/cuentas-reader-lookup.port';

// Módulo-puerto cross-módulo: expone SOLO el lookup de cuenta por id (consumido
// por `reportes` para validar la cuenta del filtro del Libro Diario). Vive separado
// de `CuentasModule` para que `reportes` lo importe sin tirar del require de
// `cuentas.module.ts` — evita el ciclo de carga CJS en prod (mismo patrón que
// PeriodosReaderModule).
@Module({
  providers: [
    PrismaService,
    TenantContextService,
    PrismaCuentasReaderLookupAdapter,
    { provide: CUENTAS_READER_LOOKUP_PORT, useExisting: PrismaCuentasReaderLookupAdapter },
  ],
  exports: [CUENTAS_READER_LOOKUP_PORT],
})
export class CuentasReaderModule {}
