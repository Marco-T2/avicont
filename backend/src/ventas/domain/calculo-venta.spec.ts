import { Money } from '@/common/domain/money';

import { calcularMontoTotal, calcularSubtotal } from './calculo-venta';

// Los asertos van contra el string EXACTO vía toString() (valor interno del
// Money), no vía toBob(): toBob() formatea con toFixed(2) —half-up— y
// enmascararía un subtotal sin redondear (31.525 se IMPRIME "31.53" aunque el
// valor crudo siga en 31.525 y contamine la Σ del total).

describe('calcularSubtotal', () => {
  // Caso elegido para DISCRIMINAR half-up de half-even (REQ-VTA-03): 31.525
  // da 31.53 con half-up y 31.52 con half-even. El caso viejo de la spec
  // (3 × 10.505 = 31.515) daba 31.52 con AMBAS políticas.
  it('5 × 6.305 = 31.525 redondea half-up a 31.53 (no 31.52 half-even)', () => {
    const subtotal = calcularSubtotal({ cantidad: '5', precioUnitario: '6.305' });

    expect(subtotal).toBeInstanceOf(Money);
    expect(subtotal.toString()).toBe('31.53');
    expect(subtotal.toBob()).toBe('31.53');
  });

  it('1 × 10.005 = 10.005 redondea half-up a 10.01', () => {
    const subtotal = calcularSubtotal({ cantidad: '1', precioUnitario: '10.005' });

    expect(subtotal.toString()).toBe('10.01');
  });

  it('el redondeo ocurre EN el dominio: el valor interno queda a 2 decimales', () => {
    const subtotal = calcularSubtotal({ cantidad: '5', precioUnitario: '6.305' });

    expect(subtotal.toString()).not.toBe('31.525');
  });

  it('un producto exacto queda intacto (2 × 400.00 = 800.00)', () => {
    const subtotal = calcularSubtotal({ cantidad: '2', precioUnitario: '400.00' });

    expect(subtotal.toBob()).toBe('800.00');
  });

  it('no muta la línea recibida', () => {
    const linea = Object.freeze({ cantidad: '5', precioUnitario: '6.305' });

    expect(() => calcularSubtotal(linea)).not.toThrow();
    expect(linea).toEqual({ cantidad: '5', precioUnitario: '6.305' });
  });
});

describe('calcularMontoTotal', () => {
  // REQ-VTA-03: montoTotal = Σ subtotales YA redondeados. Redondear la suma
  // de crudos daría 3 × 10.005 = 30.015 → 30.02, un centavo menos que la Σ
  // de los subtotales persistidos (10.01 × 3 = 30.03) — descuadre entre el
  // documento y sus propias líneas.
  it('3 líneas de 1 × 10.005: cada subtotal 10.01 y montoTotal 30.03, NO 30.02', () => {
    const lineas = [
      { cantidad: '1', precioUnitario: '10.005' },
      { cantidad: '1', precioUnitario: '10.005' },
      { cantidad: '1', precioUnitario: '10.005' },
    ];

    const total = calcularMontoTotal(lineas);

    expect(total.toString()).toBe('30.03');
    expect(total.toBob()).not.toBe('30.02');
  });

  it('el total iguala la Σ exacta de los subtotales por línea', () => {
    const lineas = [
      { cantidad: '5', precioUnitario: '6.305' },
      { cantidad: '1', precioUnitario: '10.005' },
      { cantidad: '2', precioUnitario: '400.00' },
    ];

    const sumaDeSubtotales = lineas
      .map(calcularSubtotal)
      .reduce((acc, s) => acc.plus(s), Money.ZERO);

    expect(calcularMontoTotal(lineas).equals(sumaDeSubtotales)).toBe(true);
    expect(calcularMontoTotal(lineas).toBob()).toBe('841.54');
  });

  it('una sola línea: total = su subtotal', () => {
    expect(calcularMontoTotal([{ cantidad: '5', precioUnitario: '6.305' }]).toBob()).toBe('31.53');
  });

  it('sin líneas devuelve Money.ZERO', () => {
    const total = calcularMontoTotal([]);

    expect(total.isZero()).toBe(true);
    expect(total.toBob()).toBe('0.00');
  });

  it('no muta el array ni las líneas recibidas', () => {
    const lineas = Object.freeze([
      Object.freeze({ cantidad: '1', precioUnitario: '10.005' }),
      Object.freeze({ cantidad: '1', precioUnitario: '10.005' }),
    ]);

    expect(() => calcularMontoTotal(lineas)).not.toThrow();
    expect(lineas).toHaveLength(2);
    expect(lineas[0]).toEqual({ cantidad: '1', precioUnitario: '10.005' });
  });
});
