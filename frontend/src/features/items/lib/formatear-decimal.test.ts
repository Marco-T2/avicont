import { describe, expect, it } from 'vitest';

import { formatearDecimalDisplay } from './formatear-decimal';

describe('formatearDecimalDisplay', () => {
  it('agrupa los miles con punto y usa coma decimal (es-BO)', () => {
    expect(formatearDecimalDisplay('1234.5')).toBe('1.234,5');
    expect(formatearDecimalDisplay('1234567.89')).toBe('1.234.567,89');
  });

  // El caso que motiva el helper: `formatearMontoBob` devolvería '18,51'.
  it('CONSERVA los 6 decimales de un Decimal(18,6) sin redondear', () => {
    expect(formatearDecimalDisplay('18.505')).toBe('18,505');
    expect(formatearDecimalDisplay('0.000001')).toBe('0,000001');
    expect(formatearDecimalDisplay('6.305')).toBe('6,305');
  });

  it('no inventa decimales cuando el valor es entero', () => {
    expect(formatearDecimalDisplay('25')).toBe('25');
    expect(formatearDecimalDisplay('1000')).toBe('1.000');
  });

  it('no agrupa de menos en el borde de 3 y 4 dígitos', () => {
    expect(formatearDecimalDisplay('999')).toBe('999');
    expect(formatearDecimalDisplay('1000.5')).toBe('1.000,5');
  });

  it('no agrupa la parte decimal', () => {
    expect(formatearDecimalDisplay('1.123456')).toBe('1,123456');
  });

  it('preserva ceros a la derecha tal como los mandó el backend', () => {
    expect(formatearDecimalDisplay('10.50')).toBe('10,50');
    expect(formatearDecimalDisplay('10.500000')).toBe('10,500000');
  });

  it('soporta negativos', () => {
    expect(formatearDecimalDisplay('-1234.5')).toBe('-1.234,5');
  });

  // Mostrar el dato crudo es preferible a mostrarlo transformado a medias.
  it('devuelve intacto lo que no tiene forma de decimal', () => {
    expect(formatearDecimalDisplay('')).toBe('');
    expect(formatearDecimalDisplay('N/D')).toBe('N/D');
    expect(formatearDecimalDisplay('1.2.3')).toBe('1.2.3');
    expect(formatearDecimalDisplay('1e5')).toBe('1e5');
  });
});
