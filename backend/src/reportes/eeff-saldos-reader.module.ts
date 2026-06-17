import { Module } from '@nestjs/common';

import { PrismaService } from '@/common/prisma.service';
import { TenantContextService } from '@/common/tenant-context/tenant-context.service';

import { PrismaEeffSaldosReaderAdapter } from './adapters/prisma-eeff-saldos-reader.adapter';
import { EEFF_SALDOS_READER_PORT } from './ports/eeff-saldos-reader.port';

/**
 * Módulo-puerto LEAF que expone `EEFF_SALDOS_READER_PORT` para consumo
 * cross-módulo (mismo patrón que `PeriodosReaderModule`). Lo consume
 * `cierre-ejercicio` para leer los saldos de resultado con `excluirCierre=true`.
 *
 * Vive separado de `ReportesModule` para que el consumidor lo importe sin tirar
 * del require del módulo completo (controllers, RBAC, demás services) — evita
 * peso innecesario y ciclos de carga CJS. El adapter solo depende de
 * `PrismaService`, que a su vez requiere `TenantContextService` (no es global,
 * mismo patrón que `PeriodosReaderModule`). `MetricsService` sí es global.
 */
@Module({
  providers: [
    PrismaService,
    TenantContextService,
    PrismaEeffSaldosReaderAdapter,
    { provide: EEFF_SALDOS_READER_PORT, useExisting: PrismaEeffSaldosReaderAdapter },
  ],
  exports: [EEFF_SALDOS_READER_PORT],
})
export class EeffSaldosReaderModule {}
