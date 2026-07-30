import { Money } from '@/common/domain/money';

export interface LineaCalculoVenta {
  readonly cantidad: string;
  readonly precioUnitario: string;
}

// Redondeo half-up por línea: política ÚNICA de la casa, medida en las 3
// capas (Money.div, Money.toBob, Postgres numeric(18,2)) — design del change
// `ventas-piloto`, decisión «el redondeo es HALF-UP y Money estrena
// redondearABob()». No es norma tributaria: es convención interna (REQ-VTA-03).
export function calcularSubtotal(linea: LineaCalculoVenta): Money {
  return Money.of(linea.cantidad).mul(linea.precioUnitario).redondearABob();
}

// montoTotal = Σ subtotales YA redondeados (REQ-VTA-03). Sumar los crudos y
// redondear al final descuadra el documento contra sus propias líneas
// persistidas: 3 × 10.005 → 10.01 × 3 = 30.03, pero 30.015 → 30.02.
export function calcularMontoTotal(lineas: readonly LineaCalculoVenta[]): Money {
  return lineas.map(calcularSubtotal).reduce((total, subtotal) => total.plus(subtotal), Money.ZERO);
}
