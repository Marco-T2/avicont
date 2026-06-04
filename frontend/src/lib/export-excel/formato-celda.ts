/**
 * Helpers de formato para celdas Excel.
 *
 * - §4.6 FechaContable: las fechas YYYY-MM-DD se convierten a dd/mm/yyyy
 *   partiendo el string, SIN pasar por Date/UTC (evita corrimiento de día en UTC-4).
 * - §4.5 Money: los montos string se convierten a Number SOLO en el boundary
 *   de serialización a celda (nunca para aritmética).
 */

/**
 * Convierte una fecha ISO "YYYY-MM-DD" a "dd/mm/yyyy" sin construir un Date.
 *
 * §4.6: construir new Date("2026-01-31") en UTC produce "30/01/2026" en UTC-4.
 * La manipulación de string es determinística e independiente de la zona horaria.
 */
export function formatearFechaCelda(fechaIso: string): string {
  const partes = fechaIso.split('-');
  const yyyy = partes[0] ?? '';
  const mm = partes[1] ?? '';
  const dd = partes[2] ?? '';
  return `${dd}/${mm}/${yyyy}`;
}

/**
 * Convierte un monto string decimal al número de celda Excel.
 *
 * §4.5: esta función es el ÚNICO boundary string→Number permitido.
 * Nunca usarla para aritmética. Si el parsing falla, devuelve 0 (nunca NaN
 * en una celda numérica).
 */
export function parsearMontoCelda(monto: string): number {
  const num = parseFloat(monto);
  return isNaN(num) ? 0 : num;
}
