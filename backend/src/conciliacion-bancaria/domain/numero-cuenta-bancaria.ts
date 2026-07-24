/**
 * Número de cuenta bancaria normalizado para comparación (REQ-CB-16, design §4.4).
 *
 * REGLA CRÍTICA: la comparación es EXACTA sobre el valor normalizado. Este VO
 * NO expone —y no debe exponer NUNCA— `startsWith`, `includes`, `contains`,
 * ni acceso al string normalizado para comparar por fuera. Las cuentas del
 * usuario difieren SOLO en el dígito final (`1191959-000-001` / `-002` /
 * `-003`): una comparación por prefijo o substring haría pasar las tres →
 * validación inservible y PEOR que no tenerla, porque da confianza falsa.
 */

// Guiones, espacios (incl. NBSP U+00A0), tabs, puntos y barras: separadores
// visuales que un banco puede o no incluir, nunca parte de la identidad.
const SEPARADORES_REGEX = /[-\s./]/g;

export class NumeroCuentaBancaria {
  private constructor(
    private readonly normalizado: string,
    readonly original: string,
  ) {}

  /** Quita separadores visuales, uppercase. Rechaza vacío tras normalizar. */
  static of(raw: string): NumeroCuentaBancaria {
    const normalizado = raw.replace(SEPARADORES_REGEX, '').toUpperCase();
    if (normalizado.length === 0) {
      throw new RangeError(`NumeroCuentaBancaria: valor vacío tras normalizar ("${raw}")`);
    }
    return new NumeroCuentaBancaria(normalizado, raw);
  }

  /** Única comparación disponible: igualdad TOTAL del normalizado. */
  equals(other: NumeroCuentaBancaria): boolean {
    return this.normalizado === other.normalizado;
  }

  /** Para persistir / mostrar. NO usar para comparar. */
  toString(): string {
    return this.original;
  }
}
