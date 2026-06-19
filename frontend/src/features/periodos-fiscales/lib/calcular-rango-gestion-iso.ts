// CLAUDE.md §4.6: fecha contable es calendario puro; cálculo sobre enteros, sin new Date().
// Espeja backend/src/periodos-fiscales/domain/rango-periodo-fiscal.ts con la misma regla
// bisiesta gregoriana (÷4 excepto ÷100 salvo ÷400).

/**
 * Calcula si un año es bisiesto según la regla gregoriana.
 * Espeja RangoPeriodoFiscal.esBisiesto() del backend.
 */
function esBisiesto(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/**
 * Devuelve la cantidad de días en un mes dado, con bisiesto correcto.
 * Espeja RangoPeriodoFiscal.diasEnMes() del backend.
 */
function diasEnMes(year: number, month: number): number {
  if (month === 2) return esBisiesto(year) ? 29 : 28;
  if (month === 4 || month === 6 || month === 9 || month === 11) return 30;
  return 31;
}

function padMes(month: number): string {
  return String(month).padStart(2, '0');
}

/**
 * Calcula el rango ISO YYYY-MM-DD de una gestión fiscal.
 *
 * La gestión arranca el día 1 de `mesInicio` del `year` dado, y termina
 * el último día del mes anterior a `mesInicio` (en el año correcto).
 *
 * Ejemplos:
 *   - mesInicio=1 (comercial): 2026-01-01 a 2026-12-31
 *   - mesInicio=4 (industrial): 2026-04-01 a 2027-03-31
 *
 * Función pura, sin I/O, sin new Date(). Espeja la lógica de
 * backend/src/periodos-fiscales/domain/rango-periodo-fiscal.ts (§4.6).
 *
 * @param year  Año de inicio de la gestión (ej. 2026)
 * @param mesInicio  Mes de inicio de la gestión, 1-12
 */
export function calcularRangoGestionISO(
  year: number,
  mesInicio: number,
): { fechaInicio: string; fechaFin: string } {
  if (!Number.isInteger(mesInicio) || mesInicio < 1 || mesInicio > 12) {
    throw new RangeError(
      `calcularRangoGestionISO: mesInicio inválido ${mesInicio} (debe estar entre 1 y 12)`,
    );
  }

  const fechaInicio = `${year}-${padMes(mesInicio)}-01`;

  // El mes de cierre es el mes anterior a mesInicio.
  // Si mesInicio=1, el cierre es diciembre del mismo año.
  // Para cualquier otro mesInicio, el cierre cruza al año siguiente.
  const mesCierre = mesInicio === 1 ? 12 : mesInicio - 1;
  const yearCierre = mesInicio === 1 ? year : year + 1;
  const ultimoDia = diasEnMes(yearCierre, mesCierre);
  const fechaFin = `${yearCierre}-${padMes(mesCierre)}-${String(ultimoDia).padStart(2, '0')}`;

  return { fechaInicio, fechaFin };
}
