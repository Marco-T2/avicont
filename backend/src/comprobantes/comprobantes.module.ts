import { Module } from '@nestjs/common';

import { PrismaService } from '@/common/prisma.service';
import { TenantContextService } from '@/common/tenant-context/tenant-context.service';
import { ContactosModule } from '@/contactos/contactos.module';
import { CuentasModule } from '@/cuentas/cuentas.module';
import { DocumentosFisicosModule } from '@/documentos-fisicos/documentos-fisicos.module';
import { PeriodosReaderModule } from '@/periodos-fiscales/periodos-reader.module';
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
// El consumo de `PERIODOS_READER_PORT` entra por `PeriodosReaderModule` (un
// módulo-puerto leaf), NO por `PeriodosFiscalesModule`. Eso evita el require
// de `periodos-fiscales.module.ts` y rompe el ciclo de carga CJS
// comprobantes↔periodos que crasheaba el build de prod en bootstrap.
//
// `COMPROBANTES_LOCK_PORT` (lo que periodos consume de acá) vive en
// `ComprobantesLockModule`, también leaf.
@Module({
  imports: [
    RbacModule,
    CuentasModule,
    PeriodosReaderModule,
    ContactosModule,
    // Dependencia unidireccional: comprobantes consume DOCUMENTOS_FISICOS_READER_PORT
    // y ASOCIACION_COMPROBANTE_REPOSITORY_PORT para asociar/desasociar/listar
    // documentos físicos. SIN forwardRef — documentos-fisicos NO importa comprobantes.
    DocumentosFisicosModule,
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
  ],
  exports: [ComprobantesService],
})
export class ComprobantesModule {}
