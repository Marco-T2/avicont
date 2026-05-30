/**
 * Nombres de los meses en español, indexados 1-12.
 * Util transversal: el dominio contable rotula períodos fiscales por mes.
 */
export const NOMBRE_MES: Record<number, string> = {
  1: 'Enero',
  2: 'Febrero',
  3: 'Marzo',
  4: 'Abril',
  5: 'Mayo',
  6: 'Junio',
  7: 'Julio',
  8: 'Agosto',
  9: 'Septiembre',
  10: 'Octubre',
  11: 'Noviembre',
  12: 'Diciembre',
};

/** Rótulo corto de un período fiscal, ej. `formatPeriodoCorto(2026, 5)` → "Mayo 2026". */
export function formatPeriodoCorto(year: number, month: number): string {
  return `${NOMBRE_MES[month] ?? month} ${year}`;
}
