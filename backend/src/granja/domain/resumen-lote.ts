/**
 * ResumenLote — struct de derivados del read-model de Granja.
 *
 * Cálculo puro: sin NestJS, sin Prisma, sin ClockPort. El service pide los
 * agregados crudos al LoteResumenReaderPort (adapter) y los pasa a
 * ResumenLote.calcular() para obtener los derivados en memoria.
 *
 * Diseño §6 (D5): el adapter devuelve number/string sin Money; ResumenLote
 * envuelve en Money aquí, manteniendo la capa de dominio pura.
 *
 * Invariante crítico:
 *   - avesVivas = 0 → costoPorPolloVivo = null (NUNCA divide por cero)
 */

import { Money } from '@/common/domain/money';

// ============================================================
// Input
// ============================================================

export interface ResumenLoteInput {
  loteId: string;
  cantidadInicial: number;
  /** Suma de MovimientoCantidad.cantidad (ya calculado por el reader). */
  totalMuertes: number;
  /** Suma de MovimientoInversion.monto (ya envuelta en Money por el service). */
  costoAcumulado: Money;
}

// ============================================================
// Struct de derivados
// ============================================================

export class ResumenLote {
  private constructor(
    readonly loteId: string,
    readonly cantidadInicial: number,
    readonly totalMuertes: number,
    /** cantidadInicial - totalMuertes. >= 0 garantizado por el service vía FOR UPDATE. */
    readonly avesVivas: number,
    /** Σ inversiones. */
    readonly costoAcumulado: Money,
    /**
     * avesVivas > 0 ? costoAcumulado / avesVivas : null.
     * null = mortalidad total. La UI muestra "—".
     * NUNCA se divide por cero.
     */
    readonly costoPorPolloVivo: Money | null,
    /** totalMuertes / cantidadInicial (0..1). */
    readonly porcentajeMortalidad: number,
  ) {}

  /**
   * Construye el resumen a partir de los agregados crudos.
   * Puro: testeable sin DB, sin inyecciones.
   *
   * @param input.costoAcumulado Ya debe ser un Money; el service lo arma
   *   desde el string del reader (diseño D5).
   */
  static calcular(input: ResumenLoteInput): ResumenLote {
    const avesVivas = input.cantidadInicial - input.totalMuertes;

    // avesVivas > 0 ? costo / aves : null
    // El caller (service) garantiza avesVivas >= 0 vía FOR UPDATE,
    // pero el cálculo puro también es defensivo.
    const costoPorPolloVivo = avesVivas > 0 ? input.costoAcumulado.div(avesVivas) : null;

    const porcentajeMortalidad =
      input.cantidadInicial > 0 ? input.totalMuertes / input.cantidadInicial : 0;

    return new ResumenLote(
      input.loteId,
      input.cantidadInicial,
      input.totalMuertes,
      avesVivas,
      input.costoAcumulado,
      costoPorPolloVivo,
      porcentajeMortalidad,
    );
  }
}
