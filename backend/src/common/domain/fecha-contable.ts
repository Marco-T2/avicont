/**
 * Value object calendario puro para fechas contables (CLAUDE.md §4.6 core).
 *
 * Representa una fecha de calendario (año/mes/día) SIN hora y SIN timezone.
 * El 31/12/2025 siempre es 31/12/2025 en Bolivia, en el servidor, en el test,
 * en el reporte impreso. No se convierte a UTC. No tiene hora. No hay
 * ambigüedad de zona.
 *
 * Se usa para `Comprobante.fechaContable`, facturas, cotizaciones UFV, tipo
 * de cambio — todo lo que para un auditor es "una fecha impresa en papel".
 *
 * NO se usa para `createdAt`, `updatedAt`, `auditoria.timestamp` — esos son
 * `timestamptz` UTC renderizados en `America/La_Paz` en presentación.
 */

const ISO_DATE_REGEX = /^(\d{4})-(\d{2})-(\d{2})$/;

export class FechaContable {
  private constructor(
    readonly year: number,
    readonly month: number,
    readonly day: number,
  ) {}

  /**
   * Parsea un string ISO `YYYY-MM-DD` a FechaContable. Rechaza cualquier
   * cosa que tenga hora, zona, o día inexistente en el calendario.
   */
  static fromIso(iso: string): FechaContable {
    const match = ISO_DATE_REGEX.exec(iso);
    if (!match) {
      throw new RangeError(
        `FechaContable.fromIso: formato inválido "${iso}". Esperado YYYY-MM-DD.`,
      );
    }
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    return FechaContable.of(year, month, day);
  }

  /**
   * Construye desde año/mes/día, validando que el día exista en ese mes
   * (incluye años bisiestos: 29 de febrero solo en años divisibles por 4
   * pero no por 100, o divisibles por 400).
   */
  static of(year: number, month: number, day: number): FechaContable {
    if (!Number.isInteger(year) || year < 1900 || year > 2999) {
      throw new RangeError(`FechaContable: año inválido ${year}`);
    }
    if (!Number.isInteger(month) || month < 1 || month > 12) {
      throw new RangeError(`FechaContable: mes inválido ${month}`);
    }
    const maxDay = daysInMonth(year, month);
    if (!Number.isInteger(day) || day < 1 || day > maxDay) {
      throw new RangeError(
        `FechaContable: día inválido ${day} para ${year}-${String(month).padStart(2, '0')} (máx ${maxDay})`,
      );
    }
    return new FechaContable(year, month, day);
  }

  /**
   * Convierte desde un `Date` JS leído por Prisma de una columna `@db.Date`.
   * Prisma devuelve el Date a medianoche UTC del día correspondiente — así
   * que leemos con getUTCFullYear/getUTCMonth/getUTCDate y NUNCA con
   * getFullYear/getMonth/getDate (que usan zona local).
   */
  static fromDbDate(date: Date): FechaContable {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
      throw new RangeError('FechaContable.fromDbDate: Date inválido');
    }
    return FechaContable.of(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
  }

  /**
   * Serializa a string ISO `YYYY-MM-DD`. Nunca con hora, nunca con zona.
   */
  toIso(): string {
    const mm = String(this.month).padStart(2, '0');
    const dd = String(this.day).padStart(2, '0');
    return `${this.year}-${mm}-${dd}`;
  }

  /**
   * Convierte a `Date` para persistir en Prisma `@db.Date`. Usa UTC
   * explícitamente para que la fecha no se corra según la zona del servidor.
   */
  toDbDate(): Date {
    return new Date(Date.UTC(this.year, this.month - 1, this.day));
  }

  toString(): string {
    return this.toIso();
  }

  equals(other: FechaContable): boolean {
    return this.year === other.year && this.month === other.month && this.day === other.day;
  }

  /** true si esta fecha es estrictamente anterior a `other`. */
  isBefore(other: FechaContable): boolean {
    return this.compare(other) < 0;
  }

  /** true si esta fecha es estrictamente posterior a `other`. */
  isAfter(other: FechaContable): boolean {
    return this.compare(other) > 0;
  }

  /** -1 si this < other, 0 si iguales, 1 si this > other. */
  compare(other: FechaContable): -1 | 0 | 1 {
    if (this.year !== other.year) return this.year < other.year ? -1 : 1;
    if (this.month !== other.month) return this.month < other.month ? -1 : 1;
    if (this.day !== other.day) return this.day < other.day ? -1 : 1;
    return 0;
  }
}

function daysInMonth(year: number, month: number): number {
  // Meses con 31: 1,3,5,7,8,10,12
  // Meses con 30: 4,6,9,11
  // Febrero: 28 o 29 si año bisiesto.
  if (month === 2) {
    return isLeapYear(year) ? 29 : 28;
  }
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}
