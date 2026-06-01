// Puerto de lectura del read-model de resumen de lotes. Diseñado para
// el dashboard: evita N×2 queries (una por lote) ejecutando 2 groupBy
// WHERE loteId IN (…) sin importar cuántos lotes haya (batch constante).
//
// Lo consume el servicio de dashboard (S4) para construir ResumenLote[]
// sin tocar los adapters de inversión ni cantidad directamente.

import type { Prisma } from '@prisma/client';

export const LOTE_RESUMEN_READER_PORT = Symbol('LOTE_RESUMEN_READER_PORT');

/**
 * Dato agregado crudo devuelto por la query batch.
 * El service pasa estos datos a ResumenLote.calcular() para obtener el
 * read-model calculado (avesVivas, costoPorPolloVivo, etc.).
 */
export interface LoteAgregados {
  loteId: string;
  /** Suma de movimientos_inversion.monto para el lote. */
  totalInversionBob: Prisma.Decimal;
  /** Suma de movimientos_cantidad.cantidad para el lote. */
  totalMuertes: number;
}

export abstract class LoteResumenReaderPort {
  /**
   * Retorna los agregados (inversión + muertes) para un conjunto de lotes
   * en 2 queries groupBy — constante sin importar N (anti-N×2, diseño §read-model).
   *
   * Lotes sin movimientos DEBEN aparecer en el resultado con totales en cero
   * (LEFT JOIN semántico). El caller no necesita filtrar los ausentes.
   *
   * tx es opcional: solo se pasa cuando el caller necesita consistencia dentro
   * de una transacción (ej. vista de detalle junto con un lock).
   */
  abstract agregadosPorLotes(
    organizationId: string,
    loteIds: string[],
    tx?: Prisma.TransactionClient,
  ): Promise<LoteAgregados[]>;
}
