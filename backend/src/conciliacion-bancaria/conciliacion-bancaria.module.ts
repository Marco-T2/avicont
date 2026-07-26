import { Module } from '@nestjs/common';

import { LineasCuentaReaderModule } from '@/comprobantes/lineas-cuenta-reader.module';
import { PrismaService } from '@/common/prisma.service';
import { TenantContextService } from '@/common/tenant-context/tenant-context.service';
import { CuentasModule } from '@/cuentas/cuentas.module';
import { PacksModule } from '@/packs/pack.module';
import { RbacModule } from '@/rbac/rbac.module';

import { DIALECTO_BANCOSOL } from './adapters/dialectos/bancosol.dialecto';
import { DIALECTO_BCP } from './adapters/dialectos/bcp.dialecto';
import { DIALECTO_BMSC } from './adapters/dialectos/bmsc.dialecto';
import { DIALECTO_ECONOMICO } from './adapters/dialectos/economico.dialecto';
import { DIALECTO_FIE } from './adapters/dialectos/fie.dialecto';
import { DIALECTO_FORTALEZA } from './adapters/dialectos/fortaleza.dialecto';
import { DIALECTO_UNION_XLSX } from './adapters/dialectos/union.dialecto';
import { PrismaCuentaBancariaRepository } from './adapters/prisma-cuenta-bancaria.repository';
import { PrismaImportacionExtractoRepository } from './adapters/prisma-importacion-extracto.repository';
import { PrismaMatchConciliacionRepository } from './adapters/prisma-match-conciliacion.repository';
import { PrismaMovimientoBancarioRepository } from './adapters/prisma-movimiento-bancario.repository';
import { XlsxCoreExtractoParser } from './adapters/xlsx-core-extracto-parser';
import { ConciliacionController } from './conciliacion.controller';
import { ConciliacionService } from './conciliacion.service';
import { CuentasBancariasController } from './cuentas-bancarias.controller';
import { CuentasBancariasService } from './cuentas-bancarias.service';
import { IntegridadExtractosService } from './integridad-extractos.service';
import { ExtractoImportadorService } from './extracto-importador.service';
import { ExtractoParserLookupService } from './extracto-parser-lookup.service';
import { MatchConciliacionService } from './match-conciliacion.service';
import { MovimientosBancariosController } from './movimientos-bancarios.controller';
import { MovimientosBancariosService } from './movimientos-bancarios.service';
import { CUENTA_BANCARIA_REPOSITORY_PORT } from './ports/cuenta-bancaria.repository.port';
import { EXTRACTO_PARSERS, ExtractoParserRegistry } from './ports/extracto-parser.registry';
import { IMPORTACION_EXTRACTO_REPOSITORY_PORT } from './ports/importacion-extracto.repository.port';
import { MATCH_CONCILIACION_REPOSITORY_PORT } from './ports/match-conciliacion.repository.port';
import { MOVIMIENTO_BANCARIO_REPOSITORY_PORT } from './ports/movimiento-bancario.repository.port';

// `EXTRACTO_PARSERS` cubre TODOS los valores de `PerfilExtracto`: los 3 que
// cerró el slice 4 del change `conciliacion-bancaria` (task 4.9), más
// `BCP_XLSX` y más `FORTALEZA_XLSX`/`BMSC_XLSX` (primeros dos perfiles con
// columnas Débito/Crédito separadas), todos sobre el mismo motor.
//
// `ExtractoParserRegistry` (fail-fast de `ports/extracto-parser.registry.ts`,
// slice 1) SÍ se provee: con todos los dialectos presentes, su constructor
// no revienta el bootstrap — al contrario, lo protege: si algún día se agrega
// un valor a `PerfilExtracto` sin su adapter, el arranque de la app falla en
// vez de fallar en producción (design §4.5). Nest instancia todo provider
// declarado en `providers` de forma eager, así que basta con listarlo acá
// para que su chequeo corra al boot — no hace falta que nadie lo inyecte.
//
// `ExtractoParserLookupService` (lookup LENIENTE, slice 3) se mantiene sin
// tocar como el lookup que consumen `ExtractoImportadorService` y
// `CuentasBancariasController` — cerrar el TODO del slice 3 sin modificar
// esos dos archivos (ni sus specs) evita blast radius sobre código ya
// probado; con todos los perfiles registrados su rama `undefined` (perfil sin
// adapter) queda inalcanzable en runtime, y el fail-fast de `Registry` es la
// red que lo garantiza en bootstrap.
//
// `CUENTAS_READER_PORT` entra por `CuentasModule` (§3.7 CLAUDE.md — port para
// lecturas síncronas cross-módulo, ya usado por `ComprobantesModule`).
// `ORG_PACKS_READER_PORT` entra por `PacksModule` (lo consume `PackEnabledGuard`).
//
// Slice 5: `LINEAS_CUENTA_READER_PORT` entra por `LineasCuentaReaderModule` —
// módulo-puerto LEAF de `comprobantes/` (design §3). Se importa ESE módulo y
// NO `ComprobantesModule`: el leaf no importa nada, así que es estructuralmente
// imposible cerrar un ciclo de carga CJS (precedente `PeriodosReaderModule`).
@Module({
  imports: [RbacModule, CuentasModule, PacksModule, LineasCuentaReaderModule],
  controllers: [CuentasBancariasController, ConciliacionController, MovimientosBancariosController],
  providers: [
    PrismaService,
    TenantContextService,
    CuentasBancariasService,
    IntegridadExtractosService,
    ExtractoImportadorService,
    ExtractoParserLookupService,
    ExtractoParserRegistry,
    ConciliacionService,
    MatchConciliacionService,
    MovimientosBancariosService,

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

    PrismaMatchConciliacionRepository,
    {
      provide: MATCH_CONCILIACION_REPOSITORY_PORT,
      useExisting: PrismaMatchConciliacionRepository,
    },

    {
      provide: EXTRACTO_PARSERS,
      useFactory: () => [
        new XlsxCoreExtractoParser(DIALECTO_BANCOSOL),
        new XlsxCoreExtractoParser(DIALECTO_ECONOMICO),
        new XlsxCoreExtractoParser(DIALECTO_UNION_XLSX),
        new XlsxCoreExtractoParser(DIALECTO_BCP),
        new XlsxCoreExtractoParser(DIALECTO_FORTALEZA),
        new XlsxCoreExtractoParser(DIALECTO_BMSC),
        new XlsxCoreExtractoParser(DIALECTO_FIE),
      ],
    },
  ],
})
export class ConciliacionBancariaModule {}
