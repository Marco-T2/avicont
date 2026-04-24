import { forwardRef, Module } from '@nestjs/common';

import { PrismaService } from '@/common/prisma.service';
import { TenantContextService } from '@/common/tenant-context/tenant-context.service';
import { ContactosModule } from '@/contactos/contactos.module';
import { CuentasModule } from '@/cuentas/cuentas.module';
import { PeriodosFiscalesModule } from '@/periodos-fiscales/periodos-fiscales.module';
import { RbacModule } from '@/rbac/rbac.module';

import { PrismaComprobanteRepository } from './adapters/prisma-comprobante.repository';
import { PrismaComprobantesLockAdapter } from './adapters/prisma-comprobantes-lock.adapter';
import { PrismaSecuenciaComprobanteAdapter } from './adapters/prisma-secuencia-comprobante';
import { ComprobantesController } from './comprobantes.controller';
import { ComprobantesService } from './comprobantes.service';
import { COMPROBANTE_REPOSITORY_PORT } from './ports/comprobante.repository.port';
import { COMPROBANTES_LOCK_PORT } from './ports/comprobantes-lock.port';
import { SECUENCIA_COMPROBANTE_PORT } from './ports/secuencia-comprobante.port';

// Fase 1.3: módulo completo de comprobantes — CRUD + contabilizar + anular +
// auditoría, expuesto vía HTTP.
//
// `ComprobantesLockPort` se bindea y EXPORTA desde acá (el módulo dueño del
// dominio). `PeriodosFiscalesModule` lo consume vía import. El ciclo
// comprobantes↔periodos (comprobantes necesita PERIODOS_READER_PORT,
// periodos necesita COMPROBANTES_LOCK_PORT) se resuelve con `forwardRef`
// en ambas direcciones.
@Module({
  imports: [
    RbacModule,
    CuentasModule,
    forwardRef(() => PeriodosFiscalesModule),
    ContactosModule,
  ],
  controllers: [ComprobantesController],
  providers: [
    PrismaService,
    TenantContextService,
    ComprobantesService,

    PrismaComprobanteRepository,
    { provide: COMPROBANTE_REPOSITORY_PORT, useExisting: PrismaComprobanteRepository },

    // Secuencia atómica de numeración — ON CONFLICT DO UPDATE RETURNING.
    PrismaSecuenciaComprobanteAdapter,
    { provide: SECUENCIA_COMPROBANTE_PORT, useExisting: PrismaSecuenciaComprobanteAdapter },

    // Port cross-módulo consumido por `periodos-fiscales` en los flujos de
    // cierre/reapertura. Toda operación recibe `tx` del caller y participa
    // de la misma transacción que el cambio de estado del período (§4.4).
    PrismaComprobantesLockAdapter,
    { provide: COMPROBANTES_LOCK_PORT, useExisting: PrismaComprobantesLockAdapter },
  ],
  exports: [ComprobantesService, COMPROBANTES_LOCK_PORT],
})
export class ComprobantesModule {}
