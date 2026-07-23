import { Module } from '@nestjs/common';

import { PrismaService } from '@/common/prisma.service';
import { TenantContextService } from '@/common/tenant-context/tenant-context.service';
import { CuentasModule } from '@/cuentas/cuentas.module';
import { PacksModule } from '@/packs/pack.module';
import { RbacModule } from '@/rbac/rbac.module';

import { DIALECTO_BANCOSOL } from './adapters/dialectos/bancosol.dialecto';
import { DIALECTO_ECONOMICO } from './adapters/dialectos/economico.dialecto';
import { DIALECTO_UNION_XLSX } from './adapters/dialectos/union.dialecto';
import { PrismaCuentaBancariaRepository } from './adapters/prisma-cuenta-bancaria.repository';
import { PrismaImportacionExtractoRepository } from './adapters/prisma-importacion-extracto.repository';
import { PrismaMovimientoBancarioRepository } from './adapters/prisma-movimiento-bancario.repository';
import { XlsxCoreExtractoParser } from './adapters/xlsx-core-extracto-parser';
import { CuentasBancariasController } from './cuentas-bancarias.controller';
import { CuentasBancariasService } from './cuentas-bancarias.service';
import { ExtractoImportadorService } from './extracto-importador.service';
import { ExtractoParserLookupService } from './extracto-parser-lookup.service';
import { CUENTA_BANCARIA_REPOSITORY_PORT } from './ports/cuenta-bancaria.repository.port';
import { EXTRACTO_PARSERS, ExtractoParserRegistry } from './ports/extracto-parser.registry';
import { IMPORTACION_EXTRACTO_REPOSITORY_PORT } from './ports/importacion-extracto.repository.port';
import { MOVIMIENTO_BANCARIO_REPOSITORY_PORT } from './ports/movimiento-bancario.repository.port';

// Slice 4 del change `conciliacion-bancaria`: adaptador Unión XLSX — cierra
// `EXTRACTO_PARSERS` con los 3 valores de `PerfilExtracto` (task 4.9).
//
// `ExtractoParserRegistry` (fail-fast de `ports/extracto-parser.registry.ts`,
// slice 1) ahora SÍ se provee: con los 3 dialectos presentes, su constructor
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
// probado; con los 3 perfiles registrados su rama `undefined` (perfil sin
// adapter) queda inalcanzable en runtime, y el fail-fast de `Registry` es la
// red que lo garantiza en bootstrap.
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
    ExtractoParserRegistry,

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
        new XlsxCoreExtractoParser(DIALECTO_UNION_XLSX),
      ],
    },
  ],
})
export class ConciliacionBancariaModule {}
