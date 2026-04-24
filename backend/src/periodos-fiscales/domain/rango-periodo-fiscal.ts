/**
 * Value object del rango calendario de un período fiscal (year + month).
 *
 * Los períodos NO persisten fechaInicio/fechaFin — se derivan al vuelo a
 * partir del (year, month) de la fila. Ver `docs/disenos/gestiones-periodos-fiscales-v3.md` §4.2.
 *
 * Encapsula las 3 reglas de calendario involucradas para que el service
 * no tenga que razonar sobre bisiestos ni padding manual:
 *   - día 1 del mes como `inicio`,
 *   - último día real del mes como `fin`,
 *   - año bisiesto según regla gregoriana (÷4, excepto ÷100 salvo ÷400).
 *
 * NO usa `Date` nativo — todo se calcula sobre enteros para evitar
 * cualquier interacción con timezone (CLAUDE.md §4.6 core: fecha contable
 * es calendario puro, no UTC).
 */

export interface RangoCalendario {
  inicio: string;
  fin: string;
}

export class RangoPeriodoFiscal {
  private constructor(
    readonly year: number,
    readonly month: number,
  ) {}

  static of(year: number, month: number): RangoPeriodoFiscal {
    if (!Number.isInteger(year)) {
      throw new RangeError(`RangoPeriodoFiscal: year inválido ${year}`);
    }
    if (!Number.isInteger(month) || month < 1 || month > 12) {
      throw new RangeError(
        `RangoPeriodoFiscal: mes inválido ${month} (debe estar entre 1 y 12)`,
      );
    }
    return new RangoPeriodoFiscal(year, month);
  }

  inicio(): string {
    return `${this.year}-${this.mm()}-01`;
  }

  fin(): string {
    const dd = String(this.diasEnMes()).padStart(2, '0');
    return `${this.year}-${this.mm()}-${dd}`;
  }

  toRangoCalendario(): RangoCalendario {
    return { inicio: this.inicio(), fin: this.fin() };
  }

  diasEnMes(): number {
    if (this.month === 2) return this.esBisiesto() ? 29 : 28;
    if (this.month === 4 || this.month === 6 || this.month === 9 || this.month === 11) {
      return 30;
    }
    return 31;
  }

  esBisiesto(): boolean {
    return (this.year % 4 === 0 && this.year % 100 !== 0) || this.year % 400 === 0;
  }

  equals(other: RangoPeriodoFiscal): boolean {
    return this.year === other.year && this.month === other.month;
  }

  private mm(): string {
    return String(this.month).padStart(2, '0');
  }
}
