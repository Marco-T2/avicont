/**
 * Value object del número impreso en un DocumentoFisico.
 *
 * Es el identificador del papel (ej. "FC-0042", "REC.001/2026", "T-100").
 * Se normaliza a uppercase para garantizar unicidad insensible al casing
 * con que el contador lo cargue, pero EL NÚMERO ES STRING EXACTO:
 * `"0042" ≠ "42"` (proposal D3). Los ceros a la izquierda importan.
 *
 * Reglas:
 *   - Regex post-normalización: `^[A-Z0-9./-]+$` (mayúsculas, dígitos,
 *     punto, slash, guion).
 *   - Longitud post-normalización: 1..50.
 *   - Normaliza con `trim().toUpperCase()` ANTES de validar.
 *
 * Errores específicos del VO (subclases de RangeError):
 *   - `NumeroDocumentoVacioError`
 *   - `NumeroDocumentoFormatoInvalidoError`
 *   - `NumeroDocumentoLongitudExcedidaError`
 *
 * Estos son errores TÉCNICOS de construcción del VO. El service los
 * mapea al `DocumentoFisicoNumeroFormatoInvalidoError` (DomainError 400)
 * antes de llegar al cliente.
 */

const REGEX = /^[A-Z0-9./-]+$/;
const LONGITUD_MIN = 1;
const LONGITUD_MAX = 50;

export class NumeroDocumentoVacioError extends RangeError {
  constructor() {
    super('NumeroDocumento: vacío post-normalización');
    this.name = 'NumeroDocumentoVacioError';
  }
}

export class NumeroDocumentoFormatoInvalidoError extends RangeError {
  constructor(value: string) {
    super(
      `NumeroDocumento: formato inválido "${value}" (esperado letras mayúsculas, dígitos y los caracteres ./-)`,
    );
    this.name = 'NumeroDocumentoFormatoInvalidoError';
  }
}

export class NumeroDocumentoLongitudExcedidaError extends RangeError {
  constructor(longitud: number) {
    super(
      `NumeroDocumento: longitud excedida ${longitud} (máximo ${LONGITUD_MAX})`,
    );
    this.name = 'NumeroDocumentoLongitudExcedidaError';
  }
}

export class NumeroDocumento {
  private constructor(private readonly value: string) {}

  static of(raw: string): NumeroDocumento {
    if (typeof raw !== 'string') {
      throw new RangeError('NumeroDocumento: input no es string');
    }
    const normalized = raw.trim().toUpperCase();
    if (normalized.length < LONGITUD_MIN) {
      throw new NumeroDocumentoVacioError();
    }
    if (normalized.length > LONGITUD_MAX) {
      throw new NumeroDocumentoLongitudExcedidaError(normalized.length);
    }
    if (!REGEX.test(normalized)) {
      throw new NumeroDocumentoFormatoInvalidoError(normalized);
    }
    return new NumeroDocumento(normalized);
  }

  toString(): string {
    return this.value;
  }

  equals(other: NumeroDocumento): boolean {
    return this.value === other.value;
  }
}
