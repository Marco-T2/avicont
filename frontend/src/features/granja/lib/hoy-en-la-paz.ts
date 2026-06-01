// CLAUDE.md §4.6: FechaContable es calendario puro; el "hoy" se calcula en
// America/La_Paz, nunca en UTC. Equivale al ClockPort.hoyEnLaPaz() del backend.
// Usar new Date().toISOString() acá desplaza el día cuando la hora de Bolivia
// (UTC-4) ya cruzó la medianoche en UTC.
//
// Espejo de features/comprobantes/lib/hoy-en-la-paz.ts — granja es su propio
// vertical y mantiene su lib local (Screaming Architecture, frontend §3).
const FECHA_ISO_LA_PAZ = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/La_Paz',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/**
 * Devuelve la fecha actual en La Paz (America/La_Paz) en formato ISO
 * YYYY-MM-DD, apto para pre-cargar un campo de fecha de un movimiento o lote.
 *
 * El locale 'en-CA' produce directamente el formato YYYY-MM-DD.
 *
 * @param clock función que provee el instante actual; inyectable para tests.
 */
export function hoyEnLaPaz(clock: () => Date = () => new Date()): string {
  return FECHA_ISO_LA_PAZ.format(clock());
}
