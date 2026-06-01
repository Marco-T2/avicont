import { describe, expect, it } from 'vitest';

import { formatCostoPorPollo, formatFechaGranja, formatPorcentajeMortalidad } from './formatters';

describe('formatCostoPorPollo', () => {
  it('null → "—" (mortalidad total, avesVivas = 0)', () => {
    expect(formatCostoPorPollo(null)).toBe('—');
  });

  it('"15.31" → "Bs 15.31"', () => {
    expect(formatCostoPorPollo('15.31')).toBe('Bs 15.31');
  });

  it('"0.00" → "Bs 0.00"', () => {
    expect(formatCostoPorPollo('0.00')).toBe('Bs 0.00');
  });

  it('"100.50" → "Bs 100.50"', () => {
    expect(formatCostoPorPollo('100.50')).toBe('Bs 100.50');
  });
});

describe('formatPorcentajeMortalidad', () => {
  it('0.0512 → "5.12%"', () => {
    expect(formatPorcentajeMortalidad(0.0512)).toBe('5.12%');
  });

  it('0 → "0.00%"', () => {
    expect(formatPorcentajeMortalidad(0)).toBe('0.00%');
  });

  it('1.0 → "100.00%"', () => {
    expect(formatPorcentajeMortalidad(1.0)).toBe('100.00%');
  });

  it('0.1667 → "16.67%" (redondeo 2 decimales)', () => {
    expect(formatPorcentajeMortalidad(0.1667)).toBe('16.67%');
  });
});

describe('formatFechaGranja', () => {
  it('convierte YYYY-MM-DD a dd/MM/yyyy', () => {
    expect(formatFechaGranja('2026-06-15')).toBe('15/06/2026');
  });

  it('maneja inicio de año', () => {
    expect(formatFechaGranja('2026-01-01')).toBe('01/01/2026');
  });

  it('rellena con cero en día y mes de 1 dígito', () => {
    expect(formatFechaGranja('2026-05-03')).toBe('03/05/2026');
  });

  it('no contiene guiones en el resultado', () => {
    const result = formatFechaGranja('2026-07-20');
    expect(result).not.toContain('-');
    expect(result).toContain('/');
  });
});
