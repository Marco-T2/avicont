import { Module } from '@nestjs/common';

import { PrismaService } from '@/common/prisma.service';
import { TenantContextService } from '@/common/tenant-context/tenant-context.service';

import { PrismaLineasCuentaReaderAdapter } from './adapters/prisma-lineas-cuenta-reader.adapter';
import { LINEAS_CUENTA_READER_PORT } from './ports/lineas-cuenta-reader.port';

// Módulo-puerto cross-módulo LEAF: expone el binding de lectura de líneas
// contables por cuenta (`LINEAS_CUENTA_READER_PORT`, consumido por
// `conciliacion-bancaria`). Vive separado de `ComprobantesModule` para que el
// consumidor lo importe SIN tirar del require de `comprobantes.module.ts` —
// ese es el patrón que cerró el ciclo de carga CJS que rompía el build de
// producción (ver `periodos-reader.module.ts`, molde de este archivo).
//
// Regla del patrón: CERO imports de otros módulos. `PrismaService` y su
// dependencia `TenantContextService` se declaran como providers LOCALES (igual
// que en `periodos-reader.module.ts`) — no se importa el módulo que los expone.
// Así es estructuralmente imposible cerrar un ciclo.
@Module({
  providers: [
    PrismaService,
    TenantContextService,
    PrismaLineasCuentaReaderAdapter,
    { provide: LINEAS_CUENTA_READER_PORT, useExisting: PrismaLineasCuentaReaderAdapter },
  ],
  exports: [LINEAS_CUENTA_READER_PORT],
})
export class LineasCuentaReaderModule {}
