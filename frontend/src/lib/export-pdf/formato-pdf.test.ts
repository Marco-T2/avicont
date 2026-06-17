import { describe, expect, it } from 'vitest';

import { formatearMontoPdf } from './formato-pdf';

describe('formatearMontoPdf', () => {
  it('formatea un monto entero con separador de miles "." y decimales ","', () => {
    // §4.5: el valor llega como string del backend; el formateo es presentación, sin aritmética.
    expect(formatearMontoPdf('5000.00')).toBe('5.000,00');
  });

  it('formatea cero como "0,00"', () => {
    expect(formatearMontoPdf('0.00')).toBe('0,00');
  });

  it('agrupa miles en montos grandes', () => {
    expect(formatearMontoPdf('1234567.89')).toBe('1.234.567,89');
  });

  it('preserva los dos decimales en montos chicos', () => {
    expect(formatearMontoPdf('500.50')).toBe('500,50');
  });

  it('mantiene el signo en montos negativos', () => {
    expect(formatearMontoPdf('-1500.00')).toBe('-1.500,00');
  });

  it('completa a dos decimales cuando el string trae menos', () => {
    expect(formatearMontoPdf('500.5')).toBe('500,50');
  });

  it('devuelve "0,00" ante un string no numérico (nunca NaN en el informe)', () => {
    expect(formatearMontoPdf('')).toBe('0,00');
    expect(formatearMontoPdf('abc')).toBe('0,00');
  });
});
