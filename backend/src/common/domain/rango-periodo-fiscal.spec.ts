import {
  diasEnMes,
  esBisiesto,
  rangoCalendario,
} from './rango-periodo-fiscal';

describe('rangoCalendario', () => {
  it('enero 2026 → 2026-01-01 a 2026-01-31', () => {
    expect(rangoCalendario(2026, 1)).toEqual({
      inicio: '2026-01-01',
      fin: '2026-01-31',
    });
  });

  it('abril 2026 → 30 días', () => {
    expect(rangoCalendario(2026, 4)).toEqual({
      inicio: '2026-04-01',
      fin: '2026-04-30',
    });
  });

  it('febrero 2026 (no bisiesto) → 28 días', () => {
    expect(rangoCalendario(2026, 2)).toEqual({
      inicio: '2026-02-01',
      fin: '2026-02-28',
    });
  });

  it('febrero 2024 (bisiesto) → 29 días', () => {
    expect(rangoCalendario(2024, 2)).toEqual({
      inicio: '2024-02-01',
      fin: '2024-02-29',
    });
  });

  it('febrero 2000 (divisible por 400, bisiesto) → 29 días', () => {
    expect(rangoCalendario(2000, 2)).toEqual({
      inicio: '2000-02-01',
      fin: '2000-02-29',
    });
  });

  it('febrero 2100 (divisible por 100 pero no por 400, NO bisiesto) → 28 días', () => {
    expect(rangoCalendario(2100, 2)).toEqual({
      inicio: '2100-02-01',
      fin: '2100-02-28',
    });
  });

  it('diciembre 2027 → 31 días (último mes)', () => {
    expect(rangoCalendario(2027, 12)).toEqual({
      inicio: '2027-12-01',
      fin: '2027-12-31',
    });
  });

  it('rechaza mes 0', () => {
    expect(() => rangoCalendario(2026, 0)).toThrow(RangeError);
  });

  it('rechaza mes 13', () => {
    expect(() => rangoCalendario(2026, 13)).toThrow(RangeError);
  });
});

describe('diasEnMes', () => {
  it.each([
    [1, 31],
    [2, 28], // year no bisiesto por default (2026)
    [3, 31],
    [4, 30],
    [5, 31],
    [6, 30],
    [7, 31],
    [8, 31],
    [9, 30],
    [10, 31],
    [11, 30],
    [12, 31],
  ])('mes %i en año no bisiesto (2026) → %i días', (mes, esperado) => {
    expect(diasEnMes(2026, mes)).toBe(esperado);
  });

  it('febrero bisiesto 2024 → 29', () => {
    expect(diasEnMes(2024, 2)).toBe(29);
  });
});

describe('esBisiesto', () => {
  it.each([
    [2024, true],  // divisible por 4, no por 100
    [2026, false], // no divisible por 4
    [2000, true],  // divisible por 400
    [2100, false], // divisible por 100 pero no por 400
    [2400, true],  // divisible por 400
    [1900, false], // divisible por 100 pero no por 400
  ])('%i → bisiesto? %p', (year, esperado) => {
    expect(esBisiesto(year)).toBe(esperado);
  });
});
