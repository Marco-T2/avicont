// CLAUDE.md §4.6: FechaContable es calendario puro YYYY-MM-DD;
// renderizar en America/La_Paz en la capa de presentación.
const FECHA_FORMAT = new Intl.DateTimeFormat('es-BO', {
  timeZone: 'America/La_Paz',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

/**
 * Convierte una fecha contable "YYYY-MM-DD" a "dd/MM/yyyy"
 * en la zona horaria de La Paz (America/La_Paz — CLAUDE.md §4.6).
 *
 * Ejemplo: '2026-05-01' → '01/05/2026'.
 *
 * Se agrega "T12:00:00" para fijar medianoche local y evitar que el parser ISO
 * lo interprete como UTC y desplace el día (mismo patrón que el Libro Diario).
 */
export function formatearFechaLibroMayor(fechaIso: string): string {
  const date = new Date(`${fechaIso}T12:00:00`);
  return FECHA_FORMAT.format(date);
}
