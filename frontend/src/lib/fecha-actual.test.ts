import { describe, expect, it } from 'vitest';

import { hoyEnLaPazISO, primerDiaDelAnioISO } from './fecha-actual';

describe('hoyEnLaPazISO', () => {
  it('devuelve la fecha en formato YYYY-MM-DD', () => {
    const clock = () => new Date('2026-06-16T12:00:00Z');
    expect(hoyEnLaPazISO(clock)).toBe('2026-06-16');
  });

  it('usa la zona horaria de La Paz (UTC-4), no UTC, cerca de la medianoche', () => {
    // 02:00 UTC del 1-ene = 22:00 del 31-dic en La Paz → el día contable es 31-dic.
    const clock = () => new Date('2026-01-01T02:00:00Z');
    expect(hoyEnLaPazISO(clock)).toBe('2025-12-31');
  });
});

describe('primerDiaDelAnioISO', () => {
  it('devuelve el 1 de enero del año en curso', () => {
    const clock = () => new Date('2026-06-16T12:00:00Z');
    expect(primerDiaDelAnioISO(clock)).toBe('2026-01-01');
  });

  it('toma el año en La Paz, no en UTC, cerca del cambio de año', () => {
    // 02:00 UTC del 1-ene-2026 = 31-dic-2025 en La Paz → el año en curso es 2025.
    const clock = () => new Date('2026-01-01T02:00:00Z');
    expect(primerDiaDelAnioISO(clock)).toBe('2025-01-01');
  });
});
