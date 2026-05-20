import { Module } from '@nestjs/common';

import { PrismaComprobantesLockAdapter } from './adapters/prisma-comprobantes-lock.adapter';
import { COMPROBANTES_LOCK_PORT } from './ports/comprobantes-lock.port';

// Módulo-puerto cross-módulo: expone SOLO el binding de `COMPROBANTES_LOCK_PORT`
// (consumido por `periodos-fiscales` en cierre/reapertura). Vive separado de
// `ComprobantesModule` para que `periodos-fiscales` lo importe sin tirar del
// require de `comprobantes.module.ts` — eso rompía el grafo de carga CJS en
// el build de prod (ciclo comprobantes↔periodos). El adapter sólo necesita la
// `tx` del caller, así que este módulo no arrastra controllers ni el service.
@Module({
  providers: [
    PrismaComprobantesLockAdapter,
    { provide: COMPROBANTES_LOCK_PORT, useExisting: PrismaComprobantesLockAdapter },
  ],
  exports: [COMPROBANTES_LOCK_PORT],
})
export class ComprobantesLockModule {}
