/**
 * Value object del número de un comprobante contabilizado.
 *
 * Formato (ver `docs/disenos/comprobantes-asientos.md` §2):
 *   `{prefijo}{YY}{MM}-{correlativo:6}`
 *
 * Ejemplo: `I2604-000042` → INGRESO, abril 2026, correlativo 42.
 *
 * Reglas:
 *   - `prefijo`: 1 letra que identifica el tipo (A/D/I/E/J/T/C).
 *     1 letra vs las 2 de avicont-ia (CD/CI/CE/CT/CA) porque es más
 *     legible en listados y más fácil de dictar.
 *   - `YY`: últimos 2 dígitos del año (soporta años 1900-2999).
 *   - `MM`: mes con padding a 2 dígitos.
 *   - `correlativo`: 1-999.999, padding a 6 dígitos. Holgado para
 *     ~1M comprobantes del mismo tipo por mes (ver §4.9 CLAUDE.md core —
 *     secuencia atómica con FOR UPDATE, reinicia cada mes).
 *
 * El VO se construye con `of(tipo, year, month, correlativo)` al
 * contabilizar. Para recuperar el shape desde un string persistido,
 * `parse(raw)` reconstruye los componentes.
 */

import { TipoComprobante } from '@prisma/client';

import { PREFIJO_POR_TIPO } from './numeracion';

const NUMERO_REGEX = /^([A-Z])(\d{2})(\d{2})-(\d{6})$/;
const TIPO_POR_PREFIJO: Record<string, TipoComprobante> = Object.fromEntries(
  Object.entries(PREFIJO_POR_TIPO).map(([tipo, pref]) => [pref, tipo as TipoComprobante]),
);

const CORRELATIVO_MAX = 999_999;

export class NumeroComprobante {
  private constructor(
    readonly tipo: TipoComprobante,
    readonly yearShort: string,
    readonly month: number,
    readonly correlativo: number,
  ) {}

  static of(
    tipo: TipoComprobante,
    year: number,
    month: number,
    correlativo: number,
  ): NumeroComprobante {
    if (!Number.isInteger(year) || year < 1900 || year > 2999) {
      throw new RangeError(`NumeroComprobante: year inválido ${year}`);
    }
    if (!Number.isInteger(month) || month < 1 || month > 12) {
      throw new RangeError(`NumeroComprobante: mes inválido ${month} (debe estar entre 1 y 12)`);
    }
    if (
      !Number.isInteger(correlativo) ||
      correlativo < 1 ||
      correlativo > CORRELATIVO_MAX
    ) {
      throw new RangeError(
        `NumeroComprobante: correlativo inválido ${correlativo} (1..${CORRELATIVO_MAX})`,
      );
    }
    const yearShort = String(year).padStart(4, '0').slice(-2);
    return new NumeroComprobante(tipo, yearShort, month, correlativo);
  }

  static parse(raw: string): NumeroComprobante {
    if (typeof raw !== 'string' || raw.length === 0) {
      throw new RangeError('NumeroComprobante: string vacío');
    }
    const match = NUMERO_REGEX.exec(raw);
    if (!match) {
      throw new RangeError(
        `NumeroComprobante: formato inválido "${raw}" (esperado "{prefijo}{YY}{MM}-{correlativo:6}")`,
      );
    }
    const prefijo = match[1] as string;
    const yearShort = match[2] as string;
    const month = Number(match[3]);
    const correlativo = Number(match[4]);

    const tipo = TIPO_POR_PREFIJO[prefijo];
    if (tipo === undefined) {
      throw new RangeError(`NumeroComprobante: prefijo desconocido "${prefijo}"`);
    }
    if (month < 1 || month > 12) {
      throw new RangeError(`NumeroComprobante: mes inválido ${month} en "${raw}"`);
    }
    if (correlativo < 1) {
      throw new RangeError(`NumeroComprobante: correlativo debe ser >= 1 en "${raw}"`);
    }
    return new NumeroComprobante(tipo, yearShort, month, correlativo);
  }

  toString(): string {
    const mm = String(this.month).padStart(2, '0');
    const corr = String(this.correlativo).padStart(6, '0');
    return `${PREFIJO_POR_TIPO[this.tipo]}${this.yearShort}${mm}-${corr}`;
  }

  equals(other: NumeroComprobante): boolean {
    return this.toString() === other.toString();
  }
}
