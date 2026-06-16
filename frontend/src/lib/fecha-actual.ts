// CLAUDE.md §4.6: la fecha contable es calendario puro; el "hoy" se calcula en
// America/La_Paz, nunca en UTC. `new Date().toISOString()` desplaza el día cuando
// Bolivia (UTC-4) todavía no cruzó la medianoche en UTC. Espeja el
// ClockPort.hoyEnLaPaz() del backend. El locale 'en-CA' produce YYYY-MM-DD directo.
const FECHA_ISO_LA_PAZ = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/La_Paz',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/**
 * Fecha de hoy en La Paz (America/La_Paz) en formato YYYY-MM-DD, apta para
 * inicializar un campo de fecha contable.
 *
 * @param clock función que provee el instante actual; inyectable para tests.
 */
export function hoyEnLaPazISO(clock: () => Date = () => new Date()): string {
  return FECHA_ISO_LA_PAZ.format(clock());
}

/**
 * Primer día del año en curso (en La Paz) en formato YYYY-MM-DD: `{año}-01-01`.
 * Default de "desde" para los filtros de reportes en modo rango (year-to-date).
 *
 * @param clock función que provee el instante actual; inyectable para tests.
 */
export function primerDiaDelAnioISO(clock: () => Date = () => new Date()): string {
  return `${hoyEnLaPazISO(clock).slice(0, 4)}-01-01`;
}
