// CLAUDE.md §4.5: montos del backend llegan como string decimal ("1250.50").
// Se parsean SOLO para formato display, no para aritmética sensible.

/**
 * Formatea un monto BOB string para mostrar al usuario.
 * Ejemplo: "1250.50" → "1.250,50" (locale es-BO)
 *
 * Si el parseo falla (input inesperado), devuelve el string original.
 */
export function formatearMontoBob(monto: string): string {
  const num = parseFloat(monto);
  if (isNaN(num)) return monto;
  return num.toLocaleString('es-BO', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
