import { describe, expect, it } from 'vitest';

import { formatearFechaCelda, parsearMontoCelda } from './formato-celda';

describe('formatearFechaCelda', () => {
  it('convierte fecha de día intermedio a dd/mm/yyyy', () => {
    expect(formatearFechaCelda('2026-06-15')).toBe('15/06/2026');
  });

  it('no corre el día para 2026-01-31 (fin de mes)', () => {
    // RIESGO §4.6: new Date("2026-01-31") UTC → "30/01/2026" en UTC-4
    expect(formatearFechaCelda('2026-01-31')).toBe('31/01/2026');
  });

  it('no corre el día para 2026-12-31 (fin de año)', () => {
    expect(formatearFechaCelda('2026-12-31')).toBe('31/12/2026');
  });

  it('no corre el día para 2026-03-01 (primer día de mes)', () => {
    // RIESGO §4.6: UTC−4 puede desplazar al mes anterior
    expect(formatearFechaCelda('2026-03-01')).toBe('01/03/2026');
  });
});

describe('parsearMontoCelda', () => {
  it('convierte string decimal "1250.50" al número 1250.50', () => {
    expect(parsearMontoCelda('1250.50')).toBe(1250.5);
  });

  it('convierte string entero "1000" al número 1000', () => {
    expect(parsearMontoCelda('1000')).toBe(1000);
  });

  it('aplica fallback 0 ante string inválido "abc"', () => {
    // DADO "abc" → ENTONCES 0 (nunca NaN en una celda numérica)
    expect(parsearMontoCelda('abc')).toBe(0);
  });

  it('aplica fallback 0 ante string vacío ""', () => {
    // DADO "" → ENTONCES 0
    expect(parsearMontoCelda('')).toBe(0);
  });
});
