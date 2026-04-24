import { Module } from '@nestjs/common';

import { PrismaService } from '@/common/prisma.service';
import { TenantContextService } from '@/common/tenant-context/tenant-context.service';
import { CuentasModule } from '@/cuentas/cuentas.module';
import { PeriodosFiscalesModule } from '@/periodos-fiscales/periodos-fiscales.module';
import { RbacModule } from '@/rbac/rbac.module';

import { PrismaComprobanteRepository } from './adapters/prisma-comprobante.repository';
import { PrismaSecuenciaComprobanteAdapter } from './adapters/prisma-secuencia-comprobante';
import { ComprobantesController } from './comprobantes.controller';
import { ComprobantesService } from './comprobantes.service';
import { COMPROBANTE_REPOSITORY_PORT } from './ports/comprobante.repository.port';
import { SECUENCIA_COMPROBANTE_PORT } from './ports/secuencia-comprobante.port';

// Fase 1.3: módulo completo de comprobantes — CRUD + contabilizar + anular +
// auditoría, expuesto vía HTTP.
//
// El `ComprobantesLockPort` NO se binding acá — es un port EXPUESTO por
// el módulo para consumo externo; el binding vive en quien lo consume
// (PeriodosFiscalesModule) para que el singleton ande sin DI cruzada.
@Module({
  imports: [RbacModule, CuentasModule, PeriodosFiscalesModule],
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
  ],
  exports: [ComprobantesService],
})
export class ComprobantesModule {}
