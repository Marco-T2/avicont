/**
 * Calcula el monto en bolivianos a partir del monto en moneda original
 * y el tipo de cambio. El resultado se redondea a 2 decimales.
 *
 * Usa `parseFloat` + `toFixed(2)` para PREVIEW del lado cliente —
 * el backend es la autoridad y rechazará con COMPROBANTE_MONTO_BOB_INCOHERENTE
 * si el valor difiere más de Bs 0.01 (CLAUDE.md §4.5).
 *
 * NO usa decimal.js — para visualización en slice 1 es suficiente.
 * Diferir a slice 2 si se necesita aritmética authoritative en cliente.
 */
export function calcularMontoBob(monto: string, tipoCambio: string): string {
  const montoNum = parseFloat(monto);
  const tcNum = parseFloat(tipoCambio);

  if (!isFinite(montoNum) || !isFinite(tcNum)) return '0.00';

  return (montoNum * tcNum).toFixed(2);
}
