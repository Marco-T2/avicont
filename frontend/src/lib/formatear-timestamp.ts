// CLAUDE.md §4.6: los timestamps de auditoría (`createdAt`, `updatedAt`) SÍ son
// instantes reales — se guardan en UTC y se muestran en America/La_Paz. Es el
// caso opuesto al de FechaContable, que es calendario puro y NO debe pasar por
// una zona horaria (ver `formatear-fecha-contable.ts`).
//
// La diferencia no es cosmética: un extracto importado a las 02:00 UTC se
// subió, en Bolivia, a las 22:00 del día ANTERIOR. Renderizarlo en UTC le
// mostraría al contador una fecha que no es la que él vivió.
const TIMESTAMP_LA_PAZ = new Intl.DateTimeFormat('es-BO', {
  timeZone: 'America/La_Paz',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

/**
 * Formatea un timestamp ISO (UTC) como `dd/mm/yyyy, hh:mm` en hora de La Paz.
 */
export function formatearTimestampLaPaz(iso: string): string {
  return TIMESTAMP_LA_PAZ.format(new Date(iso));
}
