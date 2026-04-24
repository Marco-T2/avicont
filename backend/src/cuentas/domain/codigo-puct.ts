/**
 * Value object del código PUCT (Plan Único de Cuentas Tributario).
 *
 * El PUCT es el catálogo oficial del SIN (RND 10-1800000004). Cada `Cuenta`
 * de un tenant puede mapearse opcionalmente a un código PUCT a nivel 4
 * (cuenta principal) — niveles 1-3 son agrupadores y nivel 5 son
 * plantillas auxiliares que no se mapean.
 *
 * Por eso el formato siempre son 4 segmentos numéricos: `"a.b.c.ddd"`.
 * Ejemplos reales del catálogo: `"1.1.1.001"`, `"2.1.1.015"`.
 *
 * Este VO valida el formato estructural. La existencia real del código en
 * el catálogo (`CatalogoPuct`) es una verificación de infraestructura que
 * hace el service vía `CatalogoPuctReaderPort`.
 */

const CODIGO_PUCT_REGEX = /^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$/;
export const NIVEL_REQUERIDO = 4;

export class CodigoPuct {
  private constructor(private readonly value: string) {}

  static create(raw: string): CodigoPuct {
    if (typeof raw !== 'string' || raw.length === 0) {
      throw new RangeError('CodigoPuct: no puede estar vacío');
    }
    if (!CODIGO_PUCT_REGEX.test(raw)) {
      throw new RangeError(
        // RND 10-1800000004: el mapeo al PUCT se hace a nivel 4.
        `CodigoPuct: formato inválido "${raw}". Esperado 4 segmentos numéricos separados por punto (ej. "1.1.1.001").`,
      );
    }
    return new CodigoPuct(raw);
  }

  toString(): string {
    return this.value;
  }

  equals(other: CodigoPuct): boolean {
    return this.value === other.value;
  }
}
