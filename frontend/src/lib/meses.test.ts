import { describe, expect, it } from 'vitest';

import { formatPeriodoCorto, NOMBRE_MES } from './meses';

describe('meses', () => {
  it('NOMBRE_MES cubre los 12 meses en español', () => {
    expect(NOMBRE_MES[1]).toBe('Enero');
    expect(NOMBRE_MES[5]).toBe('Mayo');
    expect(NOMBRE_MES[12]).toBe('Diciembre');
  });

  it('formatPeriodoCorto arma "<Mes> <Año>"', () => {
    expect(formatPeriodoCorto(2026, 5)).toBe('Mayo 2026');
    expect(formatPeriodoCorto(2025, 1)).toBe('Enero 2025');
  });

  it('formatPeriodoCorto cae al número si el mes está fuera de rango', () => {
    expect(formatPeriodoCorto(2026, 13)).toBe('13 2026');
  });
});
