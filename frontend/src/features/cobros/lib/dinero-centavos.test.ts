import { describe, expect, it } from 'vitest';

import { aCentavos, aCentavosSeguro, deCentavos } from './dinero-centavos';

describe('aCentavos', () => {
  it('parsea un monto sin decimales', () => {
    expect(aCentavos('1250')).toBe(125000n);
  });

  it('parsea un monto con un decimal (padea a 2)', () => {
    expect(aCentavos('1250.5')).toBe(125050n);
  });

  it('parsea un monto con dos decimales', () => {
    expect(aCentavos('1250.50')).toBe(125050n);
  });

  it('parsea cero en sus tres formas', () => {
    expect(aCentavos('0')).toBe(0n);
    expect(aCentavos('0.0')).toBe(0n);
    expect(aCentavos('0.00')).toBe(0n);
  });

  it('parsea centavos puros', () => {
    expect(aCentavos('0.07')).toBe(7n);
  });

  // MUTANTE parseFloat: un Decimal(18,2) al máximo (16 dígitos enteros) NO es
  // representable en IEEE-754. parseFloat('9999999999999999.99') * 100 daría
  // 1000000000000000000 (redondeado); BigInt lo conserva exacto.
  it('conserva precisión exacta en el máximo de Decimal(18,2) — mata parseFloat', () => {
    expect(aCentavos('9999999999999999.99')).toBe(999999999999999999n);
  });

  // Segundo tiro al mismo mutante, en el borde de 2^53.
  it('90071992547409.93 → centavos exactos justo sobre MAX_SAFE_INTEGER', () => {
    expect(aCentavos('90071992547409.93')).toBe(9007199254740993n);
  });

  it.each(['', ' ', '-5', '1,50', '1.234', 'abc', '1.2.3', '+3', '3.'])(
    'rechaza el string inválido %j',
    (raw) => {
      expect(() => aCentavos(raw)).toThrow('Monto inválido');
    },
  );
});

describe('aCentavosSeguro', () => {
  it('devuelve el valor para un monto válido', () => {
    expect(aCentavosSeguro('600')).toBe(60000n);
  });

  it('devuelve null para un string a medio tipear, sin lanzar', () => {
    expect(aCentavosSeguro('')).toBeNull();
    expect(aCentavosSeguro('12.')).toBeNull();
    expect(aCentavosSeguro('abc')).toBeNull();
  });
});

describe('deCentavos', () => {
  it('formatea con 2 decimales canónicos', () => {
    expect(deCentavos(125050n)).toBe('1250.50');
  });

  it('padea centavos menores a 10', () => {
    expect(deCentavos(5n)).toBe('0.05');
    expect(deCentavos(305n)).toBe('3.05');
  });

  it('cero → "0.00"', () => {
    expect(deCentavos(0n)).toBe('0.00');
  });

  it('rechaza centavos negativos', () => {
    expect(() => deCentavos(-1n)).toThrow('negativos');
  });

  it('round-trip aCentavos ∘ deCentavos es identidad sobre la forma canónica', () => {
    for (const monto of ['0.00', '300.00', '1250.50', '9999999999999999.99']) {
      expect(deCentavos(aCentavos(monto))).toBe(monto);
    }
  });
});
