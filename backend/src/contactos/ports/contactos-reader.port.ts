// Port DEFINIDO por contactos (dueño del dominio Contacto, §3.7 CLAUDE.md)
// para lecturas cross-módulo orientadas a VALIDAR LÍNEAS DE COMPROBANTE.
//
// Superficie mínima: id + activo. El validador de comprobantes sólo
// necesita saber si el contactoId referenciado existe en el tenant y si
// está activo (al contabilizar). No expone razón social, documento, ni
// otros campos — mantener el blast radius acotado.

import type { Prisma } from '@prisma/client';

export const CONTACTOS_READER_PORT = Symbol('CONTACTOS_READER_PORT');

export interface ContactoParaLinea {
  id: string;
  activo: boolean;
}

export abstract class ContactosReaderPort {
  /**
   * Lee un lote de contactos por ids, scopeados al tenant. Devuelve un Map
   * por `id` con los campos que el validador de comprobantes necesita. Los
   * ids que no existen o pertenecen a otro tenant NO aparecen en el Map.
   *
   * Acepta opcionalmente un `tx` de Prisma para que la lectura participe
   * de la misma transacción que el write del comprobante — importante al
   * contabilizar, para aislarse contra una desactivación concurrente.
   */
  abstract obtenerBatch(
    tenantId: string,
    contactoIds: string[],
    tx?: Prisma.TransactionClient,
  ): Promise<Map<string, ContactoParaLinea>>;
}
