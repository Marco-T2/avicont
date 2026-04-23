import { Module } from '@nestjs/common';

import { PrismaService } from '@/common/prisma.service';
import { TenantContextService } from '@/common/tenant-context/tenant-context.service';
import { CuentasModule } from '@/cuentas/cuentas.module';
import { PeriodosFiscalesModule } from '@/periodos-fiscales/periodos-fiscales.module';
import { RbacModule } from '@/rbac/rbac.module';

import { NoopComprobantesLockAdapter } from './adapters/noop-comprobantes-lock.adapter';
import { PrismaComprobanteRepository } from './adapters/prisma-comprobante.repository';
import { ComprobantesService } from './comprobantes.service';
import { COMPROBANTE_REPOSITORY_PORT } from './ports/comprobante.repository.port';
import { COMPROBANTES_LOCK_PORT } from './ports/comprobantes-lock.port';

// Fase 1.3: servicio de comprobantes con CRUD de borrador. El
// `PrismaComprobantesLockAdapter` concreto + controller + contabilizar/anular
// llegan en commits siguientes de la misma fase.
//
// No exporta el lock adapter todavía — `periodos-fiscales` sigue binding
// contra el Noop local hasta que Fase 1.3.x reemplace el binding allá.
@Module({
  imports: [RbacModule, CuentasModule, PeriodosFiscalesModule],
  providers: [
    PrismaService,
    TenantContextService,
    ComprobantesService,

    PrismaComprobanteRepository,
    { provide: COMPROBANTE_REPOSITORY_PORT, useExisting: PrismaComprobanteRepository },

    // Stub mientras no se integra el adapter real en `periodos-fiscales`.
    NoopComprobantesLockAdapter,
    { provide: COMPROBANTES_LOCK_PORT, useClass: NoopComprobantesLockAdapter },
  ],
  exports: [ComprobantesService],
})
export class ComprobantesModule {}
