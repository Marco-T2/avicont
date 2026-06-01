// Formateadores puros para el módulo granja.
// Sin React, sin I/O, sin side effects — testables directamente.

// Mismo patrón que features/comprobantes/lib/formatear-fecha-contable.ts
// CLAUDE.md §4.6: FechaContable es YYYY-MM-DD; renderizar en America/La_Paz.
const FECHA_FORMAT_GRANJA = new Intl.DateTimeFormat('es-BO', {
  timeZone: 'America/La_Paz',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

/**
 * Formatea el costo por pollo vivo.
 * `null` indica mortalidad total (avesVivas = 0) — se muestra como "—".
 * Un string decimal se muestra como "Bs {valor}".
 */
export function formatCostoPorPollo(value: string | null): string {
  if (value === null) return '—';
  return `Bs ${value}`;
}

/**
 * Formatea la tasa de mortalidad como porcentaje con 2 decimales.
 * Recibe un valor 0..1 (ej. 0.0512) y devuelve "5.12%".
 */
export function formatPorcentajeMortalidad(rate: number): string {
  const pct = (rate * 100).toFixed(2);
  return `${pct}%`;
}

/**
 * Convierte una fecha granja en formato ISO YYYY-MM-DD
 * a la representación legible "dd/MM/yyyy" usando la zona horaria
 * de La Paz (America/La_Paz — CLAUDE.md §4.6).
 *
 * Se agrega "T12:00:00" para forzar medianoche local antes de parsear,
 * evitando que el parser ISO lo interprete como UTC y desplace el día.
 *
 * Ejemplo: '2026-06-15' → '15/06/2026'.
 */
export function formatFechaGranja(fechaIso: string): string {
  const date = new Date(`${fechaIso}T12:00:00`);
  return FECHA_FORMAT_GRANJA.format(date);
}
