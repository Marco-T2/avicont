// Port DEFINIDO por items (dueño del dominio Item, §3.7) para lecturas
// cross-módulo orientadas a VALIDAR LÍNEAS DE VENTA.
//
// Espejo exacto de ContactosReaderPort, y a propósito: superficie mínima de
// DOS campos, id + activo. `ventas` sólo necesita saber si el itemId existe
// en el tenant y si está activo. NO expone nombre, precio ni cuenta — esos
// se leen al crear la línea y se guardan como snapshot (D-28), así que el
// port no tiene por qué crecer para servirlos (REQ-ITM-04).

import type { Prisma } from '@prisma/client';

export const ITEMS_READER_PORT = Symbol('ITEMS_READER_PORT');

export interface ItemParaLinea {
  id: string;
  activo: boolean;
}

export abstract class ItemsReaderPort {
  /**
   * Lee un lote de ítems por ids, scopeados al tenant. Los ids que no
   * existen o pertenecen a otro tenant NO aparecen en el Map — así una venta
   * con un itemId ajeno queda rechazada sin un chequeo extra (REQ-VTA-08).
   *
   * Acepta un `tx` para que la lectura participe de la misma transacción que
   * el write de la venta y se aísle contra una desactivación concurrente.
   */
  abstract obtenerBatch(
    tenantId: string,
    itemIds: string[],
    tx?: Prisma.TransactionClient,
  ): Promise<Map<string, ItemParaLinea>>;
}
