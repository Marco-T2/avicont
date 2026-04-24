import { RangoPeriodoFiscal } from './rango-periodo-fiscal';

describe('RangoPeriodoFiscal.of', () => {
  it('enero 2026 → 2026-01-01 a 2026-01-31', () => {
    const rango = RangoPeriodoFiscal.of(2026, 1);
    expect(rango.toRangoCalendario()).toEqual({
      inicio: '2026-01-01',
      fin: '2026-01-31',
    });
  });

  it('abril 2026 → 30 días', () => {
    expect(RangoPeriodoFiscal.of(2026, 4).toRangoCalendario()).toEqual({
      inicio: '2026-04-01',
      fin: '2026-04-30',
    });
  });

  it('febrero 2026 (no bisiesto) → 28 días', () => {
    expect(RangoPeriodoFiscal.of(2026, 2).toRangoCalendario()).toEqual({
      inicio: '2026-02-01',
      fin: '2026-02-28',
    });
  });

  it('febrero 2024 (bisiesto) → 29 días', () => {
    expect(RangoPeriodoFiscal.of(2024, 2).toRangoCalendario()).toEqual({
      inicio: '2024-02-01',
      fin: '2024-02-29',
    });
  });

  it('febrero 2000 (divisible por 400, bisiesto) → 29 días', () => {
    expect(RangoPeriodoFiscal.of(2000, 2).toRangoCalendario()).toEqual({
      inicio: '2000-02-01',
      fin: '2000-02-29',
    });
  });

  it('febrero 2100 (divisible por 100 pero no por 400, NO bisiesto) → 28 días', () => {
    expect(RangoPeriodoFiscal.of(2100, 2).toRangoCalendario()).toEqual({
      inicio: '2100-02-01',
      fin: '2100-02-28',
    });
  });

  it('diciembre 2027 → 31 días (último mes)', () => {
    expect(RangoPeriodoFiscal.of(2027, 12).toRangoCalendario()).toEqual({
      inicio: '2027-12-01',
      fin: '2027-12-31',
    });
  });

  it('rechaza mes 0', () => {
    expect(() => RangoPeriodoFiscal.of(2026, 0)).toThrow(RangeError);
  });

  it('rechaza mes 13', () => {
    expect(() => RangoPeriodoFiscal.of(2026, 13)).toThrow(RangeError);
  });

  it('rechaza year no entero', () => {
    expect(() => RangoPeriodoFiscal.of(2026.5, 1)).toThrow(RangeError);
  });
});

describe('RangoPeriodoFiscal.diasEnMes', () => {
  it.each([
    [1, 31],
    [2, 28],
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
    expect(RangoPeriodoFiscal.of(2026, mes).diasEnMes()).toBe(esperado);
  });

  it('febrero bisiesto 2024 → 29', () => {
    expect(RangoPeriodoFiscal.of(2024, 2).diasEnMes()).toBe(29);
  });
});

describe('RangoPeriodoFiscal.esBisiesto', () => {
  it.each([
    [2024, true],
    [2026, false],
    [2000, true],
    [2100, false],
    [2400, true],
    [1900, false],
  ])('%i → bisiesto? %p', (year, esperado) => {
    expect(RangoPeriodoFiscal.of(year, 1).esBisiesto()).toBe(esperado);
  });
});

describe('RangoPeriodoFiscal.equals', () => {
  it('true si mismo year y month', () => {
    const a = RangoPeriodoFiscal.of(2026, 4);
    const b = RangoPeriodoFiscal.of(2026, 4);
    expect(a.equals(b)).toBe(true);
  });

  it('false si distinto mes', () => {
    const a = RangoPeriodoFiscal.of(2026, 4);
    const b = RangoPeriodoFiscal.of(2026, 5);
    expect(a.equals(b)).toBe(false);
  });

  it('false si distinto año', () => {
    const a = RangoPeriodoFiscal.of(2025, 4);
    const b = RangoPeriodoFiscal.of(2026, 4);
    expect(a.equals(b)).toBe(false);
  });
});
