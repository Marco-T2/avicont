import { Global, Module } from '@nestjs/common';

import { CLOCK_PORT } from './clock.port';
import { SystemClockAdapter } from './system-clock.adapter';

/**
 * Reloj global de la app. Cualquier módulo puede inyectar `ClockPort`
 * sin importar `ClockModule` gracias a `@Global()`.
 *
 * En tests E2E, reemplazar el provider con `FakeClockAdapter` vía
 * `.overrideProvider(CLOCK_PORT).useClass(FakeClockAdapter)`.
 */
@Global()
@Module({
  providers: [
    {
      provide: CLOCK_PORT,
      useClass: SystemClockAdapter,
    },
  ],
  exports: [CLOCK_PORT],
})
export class ClockModule {}
