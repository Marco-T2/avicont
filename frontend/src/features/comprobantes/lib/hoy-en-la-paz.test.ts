import { describe, expect, it } from 'vitest';

import { hoyEnLaPaz } from './hoy-en-la-paz';

describe('hoyEnLaPaz', () => {
  it('devuelve la fecha en formato ISO YYYY-MM-DD', () => {
    const result = hoyEnLaPaz(() => new Date('2026-05-29T15:00:00Z'));
    expect(result).toBe('2026-05-29');
  });

  it('usa el día de La Paz, no el de UTC, cuando UTC ya pasó a medianoche', () => {
    // 30/05 01:00 UTC === 29/05 21:00 en La Paz (UTC-4).
    // El bug original (toISOString) devolvía "2026-05-30" acá.
    const result = hoyEnLaPaz(() => new Date('2026-05-30T01:00:00Z'));
    expect(result).toBe('2026-05-29');
  });

  it('respeta La Paz en el límite justo antes de medianoche UTC', () => {
    // 29/05 23:59 UTC === 29/05 19:59 en La Paz.
    const result = hoyEnLaPaz(() => new Date('2026-05-29T23:59:00Z'));
    expect(result).toBe('2026-05-29');
  });

  it('avanza al día siguiente recién a las 04:00 UTC (medianoche en La Paz)', () => {
    // 30/05 04:00 UTC === 30/05 00:00 en La Paz.
    const result = hoyEnLaPaz(() => new Date('2026-05-30T04:00:00Z'));
    expect(result).toBe('2026-05-30');
  });

  it('rellena con cero el mes y el día de un solo dígito', () => {
    const result = hoyEnLaPaz(() => new Date('2026-01-03T15:00:00Z'));
    expect(result).toBe('2026-01-03');
  });
});
