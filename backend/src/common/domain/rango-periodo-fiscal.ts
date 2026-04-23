/**
 * Helper puro para calcular el rango calendario de un mes (year + month)
 * como strings ISO `YYYY-MM-DD`, sin pasar por `Date` nativo ni timezone.
 *
 * Los períodos fiscales NO persisten fechaInicio/fechaFin — se derivan al
 * vuelo con este helper. Ver `docs/disenos/gestiones-periodos-fiscales-v3.md` §4.2.
 */
export interface RangoCalendario {
  inicio: string;
  fin: string;
}

export function rangoCalendario(year: number, month: number): RangoCalendario {
  if (month < 1 || month > 12) {
    throw new RangeError(`Mes inválido: ${month} (debe estar entre 1 y 12)`);
  }
  const mm = String(month).padStart(2, '0');
  const dd = String(diasEnMes(year, month)).padStart(2, '0');
  return {
    inicio: `${year}-${mm}-01`,
    fin: `${year}-${mm}-${dd}`,
  };
}

export function diasEnMes(year: number, month: number): number {
  if (month === 2) {
    return esBisiesto(year) ? 29 : 28;
  }
  if (month === 4 || month === 6 || month === 9 || month === 11) {
    return 30;
  }
  return 31;
}

export function esBisiesto(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}
