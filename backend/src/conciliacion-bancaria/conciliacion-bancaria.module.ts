import { Module } from '@nestjs/common';

import { PrismaService } from '@/common/prisma.service';
import { TenantContextService } from '@/common/tenant-context/tenant-context.service';
import { CuentasModule } from '@/cuentas/cuentas.module';
import { PacksModule } from '@/packs/pack.module';
import { RbacModule } from '@/rbac/rbac.module';

import { DIALECTO_BANCOSOL } from './adapters/dialectos/bancosol.dialecto';
import { DIALECTO_ECONOMICO } from './adapters/dialectos/economico.dialecto';
import { PrismaCuentaBancariaRepository } from './adapters/prisma-cuenta-bancaria.repository';
import { PrismaImportacionExtractoRepository } from './adapters/prisma-importacion-extracto.repository';
import { PrismaMovimientoBancarioRepository } from './adapters/prisma-movimiento-bancario.repository';
import { XlsxCoreExtractoParser } from './adapters/xlsx-core-extracto-parser';
import { CuentasBancariasController } from './cuentas-bancarias.controller';
import { CuentasBancariasService } from './cuentas-bancarias.service';
import { ExtractoImportadorService } from './extracto-importador.service';
import { ExtractoParserLookupService } from './extracto-parser-lookup.service';
import { CUENTA_BANCARIA_REPOSITORY_PORT } from './ports/cuenta-bancaria.repository.port';
import { EXTRACTO_PARSERS } from './ports/extracto-parser.registry';
import { IMPORTACION_EXTRACTO_REPOSITORY_PORT } from './ports/importacion-extracto.repository.port';
import { MOVIMIENTO_BANCARIO_REPOSITORY_PORT } from './ports/movimiento-bancario.repository.port';

// Slice 3 del change `conciliacion-bancaria`: adaptador XLSX core-compartido
// (BancoSol + Económico) + importación end-to-end.
//
// `EXTRACTO_PARSERS` v1 PARCIAL: solo 2 de los 3 valores de `PerfilExtracto`
// tienen adapter (`UNION_XLSX` llega en el slice 4). Por eso este módulo NO
// provee la `ExtractoParserRegistry` fail-fast de `ports/extracto-parser.registry.ts`
// (slice 1) — su constructor exige los 3 valores o revienta el bootstrap.
// En su lugar se provee `ExtractoParserLookupService` (lookup LENIENTE, sin
// fail-fast, ver ese archivo para el detalle y el TODO del slice 4).
//
// `CUENTAS_READER_PORT` entra por `CuentasModule` (§3.7 CLAUDE.md — port para
// lecturas síncronas cross-módulo, ya usado por `ComprobantesModule`).
// `ORG_PACKS_READER_PORT` entra por `PacksModule` (lo consume `PackEnabledGuard`).
@Module({
  imports: [RbacModule, CuentasModule, PacksModule],
  controllers: [CuentasBancariasController],
  providers: [
    PrismaService,
    TenantContextService,
    CuentasBancariasService,
    ExtractoImportadorService,
    ExtractoParserLookupService,

    PrismaCuentaBancariaRepository,
    { provide: CUENTA_BANCARIA_REPOSITORY_PORT, useExisting: PrismaCuentaBancariaRepository },

    PrismaMovimientoBancarioRepository,
    {
      provide: MOVIMIENTO_BANCARIO_REPOSITORY_PORT,
      useExisting: PrismaMovimientoBancarioRepository,
    },

    PrismaImportacionExtractoRepository,
    {
      provide: IMPORTACION_EXTRACTO_REPOSITORY_PORT,
      useExisting: PrismaImportacionExtractoRepository,
    },

    {
      provide: EXTRACTO_PARSERS,
      useFactory: () => [
        new XlsxCoreExtractoParser(DIALECTO_BANCOSOL),
        new XlsxCoreExtractoParser(DIALECTO_ECONOMICO),
      ],
    },
  ],
})
export class ConciliacionBancariaModule {}
