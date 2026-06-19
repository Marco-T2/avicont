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

// Para extraer año y mes en La Paz sin usar new Date() para el cálculo posterior.
const FECHA_PARTES_LA_PAZ = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/La_Paz',
  year: 'numeric',
  month: '2-digit',
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

// Regla bisiesta gregoriana (÷4, excepto ÷100 salvo ÷400).
// Espeja backend/src/periodos-fiscales/domain/rango-periodo-fiscal.ts (§4.6).
function esBisiesto(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

// Cantidad de días en un mes dado. Aritmética de enteros pura, sin new Date().
function diasEnMes(year: number, month: number): number {
  if (month === 2) return esBisiesto(year) ? 29 : 28;
  if (month === 4 || month === 6 || month === 9 || month === 11) return 30;
  return 31;
}

// Extrae año y mes en La Paz a partir del instante dado.
function yearMesEnLaPaz(clock: () => Date): { year: number; month: number } {
  // FECHA_PARTES_LA_PAZ.format() → 'YYYY-MM' (locale en-CA con solo year+month)
  const formatted = FECHA_PARTES_LA_PAZ.format(clock());
  const [yearStr, monthStr] = formatted.split('-');
  return { year: parseInt(yearStr, 10), month: parseInt(monthStr, 10) };
}

/**
 * Primer día del mes actual en La Paz en formato YYYY-MM-DD.
 * Usa aritmética de enteros; solo Intl se usa para obtener "hoy en La Paz".
 *
 * @param clock función que provee el instante actual; inyectable para tests.
 */
export function primerDiaDelMesISO(clock: () => Date = () => new Date()): string {
  const { year, month } = yearMesEnLaPaz(clock);
  return `${year}-${String(month).padStart(2, '0')}-01`;
}

/**
 * Último día del mes actual en La Paz en formato YYYY-MM-DD.
 * El bisiesto se calcula con aritmética gregoriana pura, sin new Date() (§4.6).
 *
 * @param clock función que provee el instante actual; inyectable para tests.
 */
export function ultimoDiaDelMesISO(clock: () => Date = () => new Date()): string {
  const { year, month } = yearMesEnLaPaz(clock);
  const ultimo = diasEnMes(year, month);
  return `${year}-${String(month).padStart(2, '0')}-${String(ultimo).padStart(2, '0')}`;
}

/**
 * Rango del mes calendario anterior al mes actual en La Paz.
 * Si hoy es enero, el mes anterior es diciembre del año pasado.
 * Todo calculado con aritmética de enteros (§4.6).
 *
 * @param clock función que provee el instante actual; inyectable para tests.
 */
export function rangoMesAnteriorISO(
  clock: () => Date = () => new Date(),
): { fechaDesde: string; fechaHasta: string } {
  const { year, month } = yearMesEnLaPaz(clock);

  // Si estamos en enero (month=1), el mes anterior es diciembre del año previo.
  const mesAnterior = month === 1 ? 12 : month - 1;
  const yearAnterior = month === 1 ? year - 1 : year;

  const pad = (n: number): string => String(n).padStart(2, '0');
  const ultimo = diasEnMes(yearAnterior, mesAnterior);

  return {
    fechaDesde: `${yearAnterior}-${pad(mesAnterior)}-01`,
    fechaHasta: `${yearAnterior}-${pad(mesAnterior)}-${pad(ultimo)}`,
  };
}
