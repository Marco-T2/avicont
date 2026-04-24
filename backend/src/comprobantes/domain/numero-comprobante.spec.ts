import { TipoComprobante } from '@prisma/client';

import { NumeroComprobante } from './numero-comprobante';

describe('NumeroComprobante.of', () => {
  it('genera "I2604-000042" para INGRESO, 2026-04, correlativo 42', () => {
    expect(NumeroComprobante.of(TipoComprobante.INGRESO, 2026, 4, 42).toString()).toBe(
      'I2604-000042',
    );
  });

  it('padea el mes con 0', () => {
    expect(NumeroComprobante.of(TipoComprobante.DIARIO, 2026, 1, 7).toString()).toBe(
      'D2601-000007',
    );
  });

  it('padea el correlativo a 6 dígitos (mínimo y máximo)', () => {
    expect(NumeroComprobante.of(TipoComprobante.EGRESO, 2026, 12, 1).toString()).toBe(
      'E2612-000001',
    );
    expect(NumeroComprobante.of(TipoComprobante.EGRESO, 2026, 12, 999_999).toString()).toBe(
      'E2612-999999',
    );
  });

  it('toma los últimos 2 dígitos del año (2099 → 99, 2000 → 00)', () => {
    expect(NumeroComprobante.of(TipoComprobante.APERTURA, 2099, 1, 1).toString()).toBe(
      'A9901-000001',
    );
    expect(NumeroComprobante.of(TipoComprobante.APERTURA, 2000, 1, 1).toString()).toBe(
      'A0001-000001',
    );
  });

  it('usa el prefijo correcto para cada tipo', () => {
    const tipos: [TipoComprobante, string][] = [
      [TipoComprobante.APERTURA, 'A'],
      [TipoComprobante.DIARIO, 'D'],
      [TipoComprobante.INGRESO, 'I'],
      [TipoComprobante.EGRESO, 'E'],
      [TipoComprobante.AJUSTE, 'J'],
      [TipoComprobante.TRASPASO, 'T'],
      [TipoComprobante.CIERRE, 'C'],
    ];
    for (const [tipo, pref] of tipos) {
      expect(NumeroComprobante.of(tipo, 2026, 1, 1).toString()).toBe(`${pref}2601-000001`);
    }
  });

  it('rechaza year fuera de rango', () => {
    expect(() => NumeroComprobante.of(TipoComprobante.DIARIO, 1899, 1, 1)).toThrow(RangeError);
    expect(() => NumeroComprobante.of(TipoComprobante.DIARIO, 3000, 1, 1)).toThrow(RangeError);
  });

  it('rechaza mes 0 o 13', () => {
    expect(() => NumeroComprobante.of(TipoComprobante.DIARIO, 2026, 0, 1)).toThrow(RangeError);
    expect(() => NumeroComprobante.of(TipoComprobante.DIARIO, 2026, 13, 1)).toThrow(RangeError);
  });

  it('rechaza correlativo inválido', () => {
    expect(() => NumeroComprobante.of(TipoComprobante.DIARIO, 2026, 1, 0)).toThrow(RangeError);
    expect(() => NumeroComprobante.of(TipoComprobante.DIARIO, 2026, 1, 1_000_000)).toThrow(
      RangeError,
    );
  });
});

describe('NumeroComprobante.parse', () => {
  it('reconstruye los componentes de un número válido', () => {
    const n = NumeroComprobante.parse('I2604-000042');
    expect(n.tipo).toBe(TipoComprobante.INGRESO);
    expect(n.yearShort).toBe('26');
    expect(n.month).toBe(4);
    expect(n.correlativo).toBe(42);
    expect(n.toString()).toBe('I2604-000042');
  });

  it('roundtrip of/parse devuelve el mismo string', () => {
    const original = NumeroComprobante.of(TipoComprobante.CIERRE, 2027, 12, 789);
    const parsed = NumeroComprobante.parse(original.toString());
    expect(parsed.equals(original)).toBe(true);
  });

  it.each([
    [''],
    ['I2604-42'],
    ['I2604000042'],
    ['IX2604-000042'],
    ['I26-04-000042'],
    ['i2604-000042'],
    ['Z2604-000042'],
  ])('rechaza formato inválido "%s"', (raw) => {
    expect(() => NumeroComprobante.parse(raw)).toThrow(RangeError);
  });

  it('rechaza mes fuera de rango', () => {
    expect(() => NumeroComprobante.parse('I2613-000001')).toThrow(/mes inválido/);
    expect(() => NumeroComprobante.parse('I2600-000001')).toThrow(/mes inválido/);
  });

  it('rechaza correlativo 0', () => {
    expect(() => NumeroComprobante.parse('I2604-000000')).toThrow(/correlativo/);
  });
});

describe('NumeroComprobante.equals', () => {
  it('true si mismo string', () => {
    const a = NumeroComprobante.of(TipoComprobante.INGRESO, 2026, 4, 42);
    const b = NumeroComprobante.of(TipoComprobante.INGRESO, 2026, 4, 42);
    expect(a.equals(b)).toBe(true);
  });

  it('false si distinto correlativo', () => {
    const a = NumeroComprobante.of(TipoComprobante.INGRESO, 2026, 4, 42);
    const b = NumeroComprobante.of(TipoComprobante.INGRESO, 2026, 4, 43);
    expect(a.equals(b)).toBe(false);
  });
});
