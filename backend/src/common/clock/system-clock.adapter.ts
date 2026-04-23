import { Injectable } from '@nestjs/common';

import { ClockPort } from './clock.port';

// Formatter único compartido entre llamadas — `Intl.DateTimeFormat` es caro
// de construir en loop, barato de reutilizar.
const LA_PAZ_YEAR_FORMATTER = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/La_Paz',
  year: 'numeric',
});

// Locale 'en-CA' devuelve ISO (YYYY-MM-DD) — trick conocido para fechas
// calendario en cualquier zona sin parseo manual.
const LA_PAZ_DATE_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/La_Paz',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

@Injectable()
export class SystemClockAdapter extends ClockPort {
  now(): Date {
    return new Date();
  }

  currentYearLaPaz(): number {
    return Number(LA_PAZ_YEAR_FORMATTER.format(new Date()));
  }

  currentDateLaPaz(): string {
    return LA_PAZ_DATE_FORMATTER.format(new Date());
  }
}
