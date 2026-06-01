// Puerto cross-módulo DEFINIDO por platform (consumidor) para escribir memberships.
// El módulo `memberships` registra el adapter concreto y lo exporta vía este token
// (CLAUDE.md §3.3 — no importación directa cross-module).
//
// Superficie mínima: solo el método que PlatformAdminService necesita para
// la creación de org con OWNER designado (REQ-SA-13).

import type { Prisma } from '@prisma/client';

export const MEMBERSHIPS_WRITER_PORT = Symbol('MEMBERSHIPS_WRITER_PORT');

export abstract class MembershipsWriterPort {
  /**
   * Crea la membership OWNER para el usuario en la organización recién creada.
   * Usado por PlatformAdminService al crear una org con OWNER designado por email.
   *
   * `tx` opcional para participar en la transacción del caller (atomicidad
   * con la creación de la org).
   */
  abstract createOwnerMembership(
    userId: string,
    organizationId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<void>;
}
