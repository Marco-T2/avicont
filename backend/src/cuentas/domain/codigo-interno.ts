/**
 * Value object del código interno de una cuenta del Plan de Cuentas.
 *
 * Formato: 1..8 segmentos numéricos separados por `.` — por ejemplo
 * `"1"` (clase raíz), `"1.1"`, `"1.1.1"`, `"1.1.1.001"`, … hasta 8 niveles.
 * La cantidad de segmentos equivale al `nivel` contable de la cuenta
 * (regla derivada, no recibida del cliente).
 *
 * El máximo de 8 niveles viene del spec del Plan de Cuentas (ver
 * `docs/disenos/plan-cuentas-comercial.md` y `MAX_NIVELES_CODIGO_INTERNO`).
 */

const CODIGO_INTERNO_REGEX = /^[0-9]+(\.[0-9]+)*$/;
export const MAX_NIVELES = 8;

export class CodigoInterno {
  private constructor(private readonly value: string) {}

  static create(raw: string): CodigoInterno {
    if (typeof raw !== 'string' || raw.length === 0) {
      throw new RangeError('CodigoInterno: no puede estar vacío');
    }
    if (!CODIGO_INTERNO_REGEX.test(raw)) {
      throw new RangeError(
        `CodigoInterno: formato inválido "${raw}". Esperado segmentos numéricos separados por punto (ej. "1.1.1.001").`,
      );
    }
    const segmentos = raw.split('.');
    if (segmentos.length > MAX_NIVELES) {
      throw new RangeError(
        `CodigoInterno: excede el máximo de ${MAX_NIVELES} niveles (recibido ${segmentos.length})`,
      );
    }
    return new CodigoInterno(raw);
  }

  toString(): string {
    return this.value;
  }

  nivel(): number {
    return this.value.split('.').length;
  }

  segmentos(): readonly string[] {
    return Object.freeze(this.value.split('.'));
  }

  equals(other: CodigoInterno): boolean {
    return this.value === other.value;
  }
}
