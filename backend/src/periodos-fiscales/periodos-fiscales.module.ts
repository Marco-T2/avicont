import { Module } from '@nestjs/common';

import { CierreEjercicioModule } from '@/cierre-ejercicio/cierre-ejercicio.module';
import { PrismaService } from '@/common/prisma.service';
import { TenantContextService } from '@/common/tenant-context/tenant-context.service';
import { ComprobantesLockModule } from '@/comprobantes/comprobantes-lock.module';
import { RbacModule } from '@/rbac/rbac.module';

import { PrismaGestionFiscalRepository } from './adapters/prisma-gestion-fiscal.repository';
import { PrismaPeriodoFiscalRepository } from './adapters/prisma-periodo-fiscal.repository';
import { GestionesFiscalesController } from './gestiones-fiscales.controller';
import { GestionesFiscalesService } from './gestiones-fiscales.service';
import { PeriodosFiscalesController } from './periodos-fiscales.controller';
import { PeriodosFiscalesService } from './periodos-fiscales.service';
import { GESTION_FISCAL_REPOSITORY_PORT } from './ports/gestion-fiscal.repository.port';
import { GESTIONES_READER_PORT } from './ports/gestiones-reader.port';
import { PERIODO_FISCAL_REPOSITORY_PORT } from './ports/periodo-fiscal.repository.port';

// Módulo combinado (ver decisión de arquitectura): Gestiones y Períodos son
// un único aggregate (gestión = raíz, período = entidad interna). Dos
// controllers + dos services, pero un solo módulo NestJS y un solo binding
// de repos.
//
// `COMPROBANTES_LOCK_PORT` (cierre/reapertura) entra por `ComprobantesLockModule`
// (módulo-puerto leaf), NO por `ComprobantesModule`. Eso evita el require de
// `comprobantes.module.ts` y rompe el ciclo de carga CJS comprobantes↔periodos.
//
// El binding de `PERIODOS_READER_PORT` (lo que comprobantes consume de acá)
// vive en `PeriodosReaderModule`, también leaf.
//
// `CierreEjercicioModule` se importa para inyectar `CierreEjercicioService` en
// el controller (endpoint POST/GET /gestiones/:id/cierre) y en el service (gate
// de `cerrar()`, REQ-GF-CIERRE-01). NO hay ciclo: cierre-ejercicio importa
// `ComprobantesModule` + `EeffSaldosReaderModule` (leafs), nunca este módulo.
@Module({
  imports: [RbacModule, ComprobantesLockModule, CierreEjercicioModule],
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
  ],
  exports: [GESTIONES_READER_PORT],
})
export class PeriodosFiscalesModule {}
