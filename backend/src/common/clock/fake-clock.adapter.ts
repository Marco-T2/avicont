import { Injectable } from '@nestjs/common';

import { ClockPort } from './clock.port';

// Mismo helper que `SystemClockAdapter`: formatea una fecha UTC a zona La Paz
// de forma determinista. Lo duplicamos acá a propósito — el fake debe ser
// independiente del adapter real y no compartir estado global.
const LA_PAZ_YEAR_FORMATTER = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/La_Paz',
  year: 'numeric',
});
const LA_PAZ_DATE_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/La_Paz',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/**
 * Reloj congelado para tests. Setear con `setTo(iso)` antes de cada caso
 * que dependa del tiempo; leer con `now()`, `currentYearLaPaz()`, etc.
 *
 * Por defecto arranca en `2026-04-23T10:00:00.000Z` (fecha "actual" del
 * proyecto). Cada test que quiera otra fecha llama `setTo(...)` en un
 * `beforeEach`.
 */
@Injectable()
export class FakeClockAdapter extends ClockPort {
  private current: Date = new Date('2026-04-23T10:00:00.000Z');

  setTo(date: Date | string): void {
    this.current = typeof date === 'string' ? new Date(date) : date;
  }

  now(): Date {
    return new Date(this.current.getTime());
  }

  currentYearLaPaz(): number {
    return Number(LA_PAZ_YEAR_FORMATTER.format(this.current));
  }

  currentDateLaPaz(): string {
    return LA_PAZ_DATE_FORMATTER.format(this.current);
  }
}
