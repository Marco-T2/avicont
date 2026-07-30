// Display de una FECHA CONTABLE (§4.6): calendario puro, sin hora y sin zona.
//
// La conversión es manipulación de STRING, nunca `new Date`. Una fecha contable
// no representa un instante, así que no hay nada que convertir entre zonas: el
// 01/07/2026 es el mismo día para el contador en La Paz y para el auditor en
// cualquier otro lado.
//
// La implementación anterior hacía `new Date(`${iso}T12:00:00`)` —que parsea en
// la zona del NAVEGADOR— y después formateaba en America/La_Paz. Dos
// conversiones sobre un dato que no las admite: desde UTC+9 el mediodía local
// cae en el día anterior en La Paz y la fecha se renderizaba CORRIDA UN DÍA.
// Mismo criterio que `formatearFechaCelda` de `@/lib/export-excel`, que ya
// resolvía esto con split para las celdas del .xlsx.
//
// Para un TIMESTAMP (createdAt, auditoría) esto NO sirve: ahí sí hay un
// instante que renderizar en America/La_Paz, y va con Intl.DateTimeFormat.

const FECHA_CONTABLE_REGEX = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Convierte una fecha contable "YYYY-MM-DD" a "dd/MM/yyyy".
 *
 * Determinístico e independiente de la zona horaria del navegador.
 * Ejemplo: '2026-05-01' → '01/05/2026'.
 *
 * Si la entrada no es exactamente YYYY-MM-DD se devuelve TAL CUAL. Es
 * deliberado: un timestamp mal pasado acá rendería su fecha UTC, que es
 * plausible y puede estar equivocada por un día. Un string visiblemente raro
 * en pantalla se reporta y se arregla; una fecha corrida en silencio, no.
 */
export function formatearFechaContable(fechaIso: string): string {
  const partes = FECHA_CONTABLE_REGEX.exec(fechaIso);
  if (partes === null) return fechaIso;

  const [, yyyy, mm, dd] = partes;
  return `${dd}/${mm}/${yyyy}`;
}
