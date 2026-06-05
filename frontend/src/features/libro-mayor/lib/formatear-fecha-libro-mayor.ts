// SOLO para display en la UI: convierte la fecha usando America/La_Paz porque la capa de
// presentación debe mostrar la hora local del usuario (CLAUDE.md §4.6).
// Para exportar a Excel, usar `formatearFechaCelda` de `@/lib/export-excel` en su lugar:
// ese helper hace string-split puro (sin Date ni zona horaria) y garantiza que no hay
// corrimiento de día por UTC — crítico para celdas numéricas de fecha en el archivo .xlsx.
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
