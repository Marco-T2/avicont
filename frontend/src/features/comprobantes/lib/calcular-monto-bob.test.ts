import { describe, expect, it } from 'vitest';

import { calcularMontoBob } from './calcular-monto-bob';

describe('calcularMontoBob', () => {
  it('BOB con tipoCambio 1 retorna el mismo monto', () => {
    expect(calcularMontoBob('1000.00', '1')).toBe('1000.00');
  });

  it('multiplica correctamente USD × tipoCambio', () => {
    expect(calcularMontoBob('100', '6.96')).toBe('696.00');
  });

  it('redondea a 2 decimales', () => {
    // 100 × 6.965 = 696.5 → 696.50
    expect(calcularMontoBob('100', '6.965')).toBe('696.50');
  });

  it('monto cero retorna "0.00"', () => {
    expect(calcularMontoBob('0', '6.96')).toBe('0.00');
  });

  it('monto vacío retorna "0.00"', () => {
    expect(calcularMontoBob('', '1')).toBe('0.00');
  });

  it('tipoCambio vacío retorna "0.00"', () => {
    expect(calcularMontoBob('100', '')).toBe('0.00');
  });

  it('maneja decimales de 5 cifras (USD con tipoCambio preciso)', () => {
    // 1.50 USD × 6.96000 = 10.44000 → "10.44"
    expect(calcularMontoBob('1.50', '6.96000')).toBe('10.44');
  });

  it('string no numérico retorna "0.00"', () => {
    expect(calcularMontoBob('abc', '1')).toBe('0.00');
  });
});
