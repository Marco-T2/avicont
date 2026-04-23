import { Module } from '@nestjs/common';

import { PrismaService } from '@/common/prisma.service';
import { TenantContextService } from '@/common/tenant-context/tenant-context.service';
import { NoopComprobantesLockAdapter } from '@/comprobantes/adapters/noop-comprobantes-lock.adapter';
import { COMPROBANTES_LOCK_PORT } from '@/comprobantes/ports/comprobantes-lock.port';
import { RbacModule } from '@/rbac/rbac.module';

import { PrismaGestionFiscalRepository } from './adapters/prisma-gestion-fiscal.repository';
import { PrismaPeriodoFiscalRepository } from './adapters/prisma-periodo-fiscal.repository';
import { PrismaPeriodosReaderAdapter } from './adapters/prisma-periodos-reader.adapter';
import { GestionesFiscalesController } from './gestiones-fiscales.controller';
import { GestionesFiscalesService } from './gestiones-fiscales.service';
import { PeriodosFiscalesController } from './periodos-fiscales.controller';
import { PeriodosFiscalesService } from './periodos-fiscales.service';
import { GESTION_FISCAL_REPOSITORY_PORT } from './ports/gestion-fiscal.repository.port';
import { GESTIONES_READER_PORT } from './ports/gestiones-reader.port';
import { PERIODO_FISCAL_REPOSITORY_PORT } from './ports/periodo-fiscal.repository.port';
import { PERIODOS_READER_PORT } from './ports/periodos-reader.port';

// Módulo combinado (ver decisión de arquitectura): Gestiones y Períodos son
// un único aggregate (gestión = raíz, período = entidad interna). Dos
// controllers + dos services, pero un solo módulo NestJS y un solo binding
// de repos.
@Module({
  imports: [RbacModule],
  controllers: [GestionesFiscalesController, PeriodosFiscalesController],
  providers: [
    PrismaService,
    TenantContextService,
    GestionesFiscalesService,
    PeriodosFiscalesService,

    // Adapter de Prisma — implementa ambos puertos (repositorio + reader)
    PrismaGestionFiscalRepository,
    {
      provide: GESTION_FISCAL_REPOSITORY_PORT,
      useExisting: PrismaGestionFiscalRepository,
    },
    // Mismo singleton sirve al puerto de lectura consumido por `tenants`
    // para validar la inmutabilidad del tipoEmpresaPrincipal.
    {
      provide: GESTIONES_READER_PORT,
      useExisting: PrismaGestionFiscalRepository,
    },

    PrismaPeriodoFiscalRepository,
    {
      provide: PERIODO_FISCAL_REPOSITORY_PORT,
      useExisting: PrismaPeriodoFiscalRepository,
    },

    // Lector de períodos por fecha — consumido por `comprobantes` (Fase 1.3+)
    // para resolver periodoFiscalId y validar el estado del período.
    PrismaPeriodosReaderAdapter,
    {
      provide: PERIODOS_READER_PORT,
      useExisting: PrismaPeriodosReaderAdapter,
    },

    // Fase 1.2: adapter stub del lock de comprobantes. Se reemplaza en 1.3.
    {
      provide: COMPROBANTES_LOCK_PORT,
      useClass: NoopComprobantesLockAdapter,
    },
  ],
  exports: [GESTIONES_READER_PORT, PERIODOS_READER_PORT],
})
export class PeriodosFiscalesModule {}
