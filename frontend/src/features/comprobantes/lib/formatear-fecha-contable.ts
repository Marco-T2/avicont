// Formateador reutilizable para fechas contables.
// CLAUDE.md §4.6: FechaContable es calendario puro YYYY-MM-DD; renderizar
// en America/La_Paz en capa de presentación.
const FECHA_FORMAT = new Intl.DateTimeFormat('es-BO', {
  timeZone: 'America/La_Paz',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

/**
 * Convierte una fecha contable en formato ISO YYYY-MM-DD
 * a la representación legible "dd/MM/yyyy" usando la zona horaria
 * de La Paz (America/La_Paz — CLAUDE.md §4.6).
 *
 * Ejemplo: '2026-04-22' → '22/04/2026'.
 *
 * Se agrega "T00:00:00" para forzar medianoche local antes de parsear,
 * evitando que el parser ISO lo interprete como UTC y desplace el día.
 */
export function formatearFechaContable(fechaIso: string): string {
  // Agregar hora fija en zona local para evitar shift de UTC a La_Paz
  const date = new Date(`${fechaIso}T12:00:00`);
  return FECHA_FORMAT.format(date);
}
