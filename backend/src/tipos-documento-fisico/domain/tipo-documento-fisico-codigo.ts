/**
 * Value object del código de un TipoDocumentoFisico.
 *
 * Es el ID estable per-tenant del catálogo: usado como ancla del seed
 * (idempotencia vía upsert por (organizationId, codigo)) y para queries
 * cross-módulo. Inmutable post-create.
 *
 * Reglas:
 *   - Formato: kebab-case alfanumérico (ej. `factura-recibida`,
 *     `recibo-egreso`, `vale-caja`). Empieza/termina con alfanumérico,
 *     sin guiones consecutivos, solo lowercase.
 *   - Longitud post-normalización: 1..20.
 *   - Normaliza el input con `trim().toLowerCase()` ANTES de validar.
 */

const REGEX = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const LONGITUD_MIN = 1;
const LONGITUD_MAX = 20;

export class TipoDocumentoFisicoCodigo {
  private constructor(private readonly value: string) {}

  static of(raw: string): TipoDocumentoFisicoCodigo {
    if (typeof raw !== 'string') {
      throw new RangeError('TipoDocumentoFisicoCodigo: input no es string');
    }
    const normalized = raw.trim().toLowerCase();
    if (normalized.length < LONGITUD_MIN || normalized.length > LONGITUD_MAX) {
      throw new RangeError(
        `TipoDocumentoFisicoCodigo: longitud inválida ${normalized.length} (debe ser ${LONGITUD_MIN}..${LONGITUD_MAX})`,
      );
    }
    if (!REGEX.test(normalized)) {
      throw new RangeError(
        `TipoDocumentoFisicoCodigo: formato inválido "${normalized}" (esperado kebab-case alfanumérico)`,
      );
    }
    return new TipoDocumentoFisicoCodigo(normalized);
  }

  toString(): string {
    return this.value;
  }

  equals(other: TipoDocumentoFisicoCodigo): boolean {
    return this.value === other.value;
  }
}
