import { Module } from '@nestjs/common';

import { PrismaService } from '@/common/prisma.service';
import { TenantContextService } from '@/common/tenant-context/tenant-context.service';
import { ComprobantesModule } from '@/comprobantes/comprobantes.module';
import { EeffSaldosReaderModule } from '@/reportes/eeff-saldos-reader.module';

import { EeffCierreSaldosAdapter } from './adapters/eeff-cierre-saldos.adapter';
import { PrismaCierreConfigReaderAdapter } from './adapters/prisma-cierre-config-reader.adapter';
import { PrismaCierreGestionReaderAdapter } from './adapters/prisma-cierre-gestion-reader.adapter';
import { CierreEjercicioService } from './cierre-ejercicio.service';
import { CIERRE_CONFIG_READER_PORT } from './ports/cierre-config-reader.port';
import { CIERRE_GESTION_READER_PORT } from './ports/cierre-gestion-reader.port';
import { CIERRE_SALDOS_READER_PORT } from './ports/cierre-saldos-reader.port';

/**
 * Módulo `cierre-ejercicio` — orquesta el cierre del ejercicio fiscal: genera
 * los 3 comprobantes tipo CIERRE en BORRADOR no-editable.
 *
 * Imports (cruce de frontera vía port, §3.7):
 *   - `EeffSaldosReaderModule` (leaf de reportes) → EEFF_SALDOS_READER_PORT para
 *     los saldos de resultado con `excluirCierre=true`.
 *   - `ComprobantesModule` → CIERRE_COMPROBANTE_WRITER_PORT (path-sistema).
 *
 * Sus 3 ports propios (saldos/config/gestion) los provee él mismo. Los adapters
 * de config y gestión leen su propia superficie Prisma (mismo patrón que los
 * adapters de reportes — no importan el repo de configuracion-contable/tenants/
 * periodos, evitando ciclos de carga CJS).
 *
 * El Batch 5 agrega el controller y el wiring en `app.module.ts` /
 * `periodos-fiscales.module.ts` (gate en `cerrar()`).
 */
@Module({
  imports: [EeffSaldosReaderModule, ComprobantesModule],
  providers: [
    PrismaService,
    TenantContextService,
    CierreEjercicioService,

    EeffCierreSaldosAdapter,
    { provide: CIERRE_SALDOS_READER_PORT, useExisting: EeffCierreSaldosAdapter },

    PrismaCierreConfigReaderAdapter,
    { provide: CIERRE_CONFIG_READER_PORT, useExisting: PrismaCierreConfigReaderAdapter },

    PrismaCierreGestionReaderAdapter,
    { provide: CIERRE_GESTION_READER_PORT, useExisting: PrismaCierreGestionReaderAdapter },
  ],
  exports: [CierreEjercicioService],
})
export class CierreEjercicioModule {}
