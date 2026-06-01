import { describe, expect, it } from 'vitest';

import { hoyEnLaPaz } from './hoy-en-la-paz';

describe('hoyEnLaPaz', () => {
  it('devuelve la fecha en formato ISO YYYY-MM-DD', () => {
    const result = hoyEnLaPaz(() => new Date('2026-06-15T18:00:00Z'));
    expect(result).toBe('2026-06-15');
  });

  it('usa la zona America/La_Paz, no UTC (medianoche cruzada)', () => {
    // 2026-06-16 01:00 UTC == 2026-06-15 21:00 en La Paz (UTC-4).
    // Si calculara en UTC daría '2026-06-16'; en La Paz debe dar '2026-06-15'.
    const result = hoyEnLaPaz(() => new Date('2026-06-16T01:00:00Z'));
    expect(result).toBe('2026-06-15');
  });

  it('sin argumento usa el reloj real y devuelve un YYYY-MM-DD válido', () => {
    expect(hoyEnLaPaz()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
