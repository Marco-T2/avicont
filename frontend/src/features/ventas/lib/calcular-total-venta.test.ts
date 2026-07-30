import { describe, expect, it } from 'vitest';

import { calcularSubtotalPreview, calcularTotalPreview } from './calcular-total-venta';

describe('calcularSubtotalPreview', () => {
  it('redondea half-up, no half-even: 5 × 6.305 = 31.525 → 31.53', () => {
    // Caso elegido para DISCRIMINAR políticas (REQ-VTA-03): half-even daría
    // "31.52". Si este test pasa con "31.52", el preview divergiría del backend.
    expect(calcularSubtotalPreview('5', '6.305')).toBe('31.53');
  });

  it('multiplica exacto sin ruido de float: 1 × 10.005 → 10.01', () => {
    expect(calcularSubtotalPreview('1', '10.005')).toBe('10.01');
  });

  it('acepta cantidades fraccionarias: 2.5 × 4.1 → 10.25', () => {
    expect(calcularSubtotalPreview('2.5', '4.1')).toBe('10.25');
  });

  it('precio 0 (ítem bonificado) → 0.00', () => {
    expect(calcularSubtotalPreview('3', '0')).toBe('0.00');
  });

  it('montos menores a 1 Bs conservan el cero inicial', () => {
    expect(calcularSubtotalPreview('1', '0.4')).toBe('0.40');
  });

  it('devuelve null mientras el usuario tipea un valor inválido', () => {
    expect(calcularSubtotalPreview('', '6.305')).toBeNull();
    expect(calcularSubtotalPreview('5', '')).toBeNull();
    expect(calcularSubtotalPreview('5.', '1')).toBeNull();
    expect(calcularSubtotalPreview('abc', '1')).toBeNull();
    expect(calcularSubtotalPreview('-1', '1')).toBeNull();
  });
});

describe('calcularTotalPreview', () => {
  it('suma subtotales YA redondeados: 3 líneas de 1 × 10.005 → 30.03', () => {
    // Redondear la suma cruda (30.015) daría "30.02" — la regla de REQ-VTA-03
    // es sumar los subtotales redondeados, igual que el backend.
    const lineas = [
      { cantidad: '1', precioUnitario: '10.005' },
      { cantidad: '1', precioUnitario: '10.005' },
      { cantidad: '1', precioUnitario: '10.005' },
    ];
    expect(calcularTotalPreview(lineas)).toBe('30.03');
  });

  it('excluye líneas incompletas de la suma', () => {
    const lineas = [
      { cantidad: '2', precioUnitario: '10' },
      { cantidad: '', precioUnitario: '5' },
    ];
    expect(calcularTotalPreview(lineas)).toBe('20.00');
  });

  it('sin líneas → 0.00', () => {
    expect(calcularTotalPreview([])).toBe('0.00');
  });
});
