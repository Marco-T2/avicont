import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { PrismaService } from '@/common/prisma.service';
import { TenantContextService } from '@/common/tenant-context/tenant-context.service';
import { ContactosModule } from '@/contactos/contactos.module';
import { CuentasModule } from '@/cuentas/cuentas.module';
import { DocumentosFisicosModule } from '@/documentos-fisicos/documentos-fisicos.module';
import { PeriodosReaderModule } from '@/periodos-fiscales/periodos-reader.module';
import { RbacModule } from '@/rbac/rbac.module';
import { PacksModule } from '@/packs/pack.module';

import { MinioStorageAdapter } from './adapters/minio-storage.adapter';
import { PrismaAdjuntoComprobanteRepository } from './adapters/prisma-adjunto-comprobante.repository';
import { PrismaCierreComprobanteWriterAdapter } from './adapters/prisma-cierre-comprobante-writer.adapter';
import { PrismaComprobanteRepository } from './adapters/prisma-comprobante.repository';
import { PrismaSecuenciaComprobanteAdapter } from './adapters/prisma-secuencia-comprobante';
import { ComprobantesController } from './comprobantes.controller';
import { ComprobantesService } from './comprobantes.service';
import { AuditedTransactionRunner } from './infrastructure/audited-transaction.runner';
import { ADJUNTO_COMPROBANTE_REPOSITORY_PORT } from './ports/adjunto-comprobante.repository.port';
import { CIERRE_COMPROBANTE_WRITER_PORT } from './ports/cierre-comprobante-writer.port';
import { COMPROBANTE_REPOSITORY_PORT } from './ports/comprobante.repository.port';
import { SECUENCIA_COMPROBANTE_PORT } from './ports/secuencia-comprobante.port';
import { STORAGE_PORT } from './ports/storage.port';

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
    // Riel de packs (eje 2): exporta ORG_PACKS_READER_PORT que consume
    // PackEnabledGuard para verificar si 'contabilidad.adjuntos' está activo.
    PacksModule,
  ],
  controllers: [ComprobantesController],
  providers: [
    PrismaService,
    TenantContextService,
    ComprobantesService,

    // Wrapper transaccional de auditoría — mismo módulo, inyección directa OK
    // (CLAUDE.md §3.7). Toda TX que emita comprobantes_audit DEBE pasar por acá.
    AuditedTransactionRunner,

    PrismaComprobanteRepository,
    { provide: COMPROBANTE_REPOSITORY_PORT, useExisting: PrismaComprobanteRepository },

    // Secuencia atómica de numeración — ON CONFLICT DO UPDATE RETURNING.
    PrismaSecuenciaComprobanteAdapter,
    { provide: SECUENCIA_COMPROBANTE_PORT, useExisting: PrismaSecuenciaComprobanteAdapter },

    // Storage de adjuntos (MinIO). ConfigService inyectado para leer vars MINIO_*.
    // Separado de la app Docker a propósito: el adapter se configura desde env.
    {
      provide: MinioStorageAdapter,
      useFactory: (config: ConfigService) => new MinioStorageAdapter(config),
      inject: [ConfigService],
    },
    { provide: STORAGE_PORT, useExisting: MinioStorageAdapter },

    // Repositorio de adjuntos (Prisma).
    PrismaAdjuntoComprobanteRepository,
    {
      provide: ADJUNTO_COMPROBANTE_REPOSITORY_PORT,
      useExisting: PrismaAdjuntoComprobanteRepository,
    },

    // Path-sistema de escritura de comprobantes de cierre (REQ-CMP-SYS-03).
    // Lo consume el módulo `cierre-ejercicio` para crear/regenerar los 3
    // comprobantes de cierre con `generadoPorSistema=true`.
    PrismaCierreComprobanteWriterAdapter,
    {
      provide: CIERRE_COMPROBANTE_WRITER_PORT,
      useExisting: PrismaCierreComprobanteWriterAdapter,
    },
  ],
  exports: [ComprobantesService, CIERRE_COMPROBANTE_WRITER_PORT],
})
export class ComprobantesModule {}
