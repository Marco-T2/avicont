/**
 * Value object del nombre user-facing de un TipoDocumentoFisico.
 *
 * Texto libre que aparece en UI al contador. Editable post-create
 * (a diferencia del código).
 *
 * Reglas:
 *   - No vacío post-trim.
 *   - Longitud post-trim: 1..100.
 *   - Normaliza con `trim()` antes de validar y persistir; preserva el
 *     casing interno.
 */

const LONGITUD_MIN = 1;
const LONGITUD_MAX = 100;

export class TipoDocumentoFisicoNombre {
  private constructor(private readonly value: string) {}

  static of(raw: string): TipoDocumentoFisicoNombre {
    if (typeof raw !== 'string') {
      throw new RangeError('TipoDocumentoFisicoNombre: input no es string');
    }
    const normalized = raw.trim();
    if (normalized.length < LONGITUD_MIN) {
      throw new RangeError('TipoDocumentoFisicoNombre: vacío post-trim');
    }
    if (normalized.length > LONGITUD_MAX) {
      throw new RangeError(
        `TipoDocumentoFisicoNombre: longitud excedida ${normalized.length} (máximo ${LONGITUD_MAX})`,
      );
    }
    return new TipoDocumentoFisicoNombre(normalized);
  }

  toString(): string {
    return this.value;
  }

  equals(other: TipoDocumentoFisicoNombre): boolean {
    return this.value === other.value;
  }
}
