import { Module } from '@nestjs/common';

import { PrismaService } from '@/common/prisma.service';
import { TenantContextService } from '@/common/tenant-context/tenant-context.service';

import { PrismaUsuarioReaderAdapter } from './adapters/prisma-usuario-reader.adapter';
import { USUARIO_READER_PORT } from './ports/usuario-reader.port';

// Módulo-puerto cross-módulo LEAF: expone el binding de lectura de identidad
// de usuario (`USUARIO_READER_PORT`). Vive separado de `UsersModule` para que
// el consumidor lo importe SIN tirar del require de `users.module.ts` — mismo
// patrón que `lineas-cuenta-reader.module.ts` y `periodos-reader.module.ts`,
// el que cerró el ciclo de carga CJS que rompía el build de producción.
//
// Regla del patrón: CERO imports de otros módulos. `PrismaService` y su
// dependencia `TenantContextService` se declaran como providers LOCALES. Así
// es estructuralmente imposible cerrar un ciclo.
@Module({
  providers: [
    PrismaService,
    TenantContextService,
    PrismaUsuarioReaderAdapter,
    { provide: USUARIO_READER_PORT, useExisting: PrismaUsuarioReaderAdapter },
  ],
  exports: [USUARIO_READER_PORT],
})
export class UsuarioReaderModule {}
