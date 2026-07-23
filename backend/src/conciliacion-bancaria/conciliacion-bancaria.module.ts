import { Module } from '@nestjs/common';

import { PrismaService } from '@/common/prisma.service';
import { TenantContextService } from '@/common/tenant-context/tenant-context.service';
import { CuentasModule } from '@/cuentas/cuentas.module';
import { PacksModule } from '@/packs/pack.module';
import { RbacModule } from '@/rbac/rbac.module';

import { PrismaCuentaBancariaRepository } from './adapters/prisma-cuenta-bancaria.repository';
import { CuentasBancariasController } from './cuentas-bancarias.controller';
import { CuentasBancariasService } from './cuentas-bancarias.service';
import { CUENTA_BANCARIA_REPOSITORY_PORT } from './ports/cuenta-bancaria.repository.port';

// Slice 1 del change `conciliacion-bancaria`: CRUD de `CuentaBancaria`.
//
// `ExtractoParserRegistry`/`EXTRACTO_PARSERS` NO se wirean todavía (ver
// `ports/extracto-parser.registry.ts`) — los 3 adapters concretos llegan en
// slices 3-4. El registry valida en su constructor que TODOS los valores de
// `PerfilExtracto` tengan adapter (fail-fast en bootstrap); wirearlo hoy con
// una lista vacía/parcial rompería el arranque de TODA la app. Por eso el
// endpoint `GET /cuentas-bancarias/perfiles` de tasks.md 1.10 también queda
// diferido a cuando el registry tenga al menos wiring parcial coherente con
// slice 3 (ver reporte de apply de este slice para el detalle).
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

    PrismaCuentaBancariaRepository,
    { provide: CUENTA_BANCARIA_REPOSITORY_PORT, useExisting: PrismaCuentaBancariaRepository },
  ],
})
export class ConciliacionBancariaModule {}
