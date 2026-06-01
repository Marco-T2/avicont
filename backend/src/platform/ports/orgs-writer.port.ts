// Puerto cross-módulo DEFINIDO por platform (consumidor) para escribir organizaciones.
// El módulo `tenants` registra el adapter concreto y lo exporta vía este token
// (CLAUDE.md §3.3 — no importación directa cross-module).
//
// Slice 6a: solo `create`. Los métodos `updateStatus` y `updateEntitlement`
// se agregan en Slice 6b (PATCH /status y PATCH /entitlement).

import type { Prisma } from '@prisma/client';

import type { OrganizationConMemberships } from '@/tenants/ports/tenant.repository.port';

export const ORGS_WRITER_PORT = Symbol('ORGS_WRITER_PORT');

export interface OrgCreateData {
  name: string;
  slug: string;
  ownerUserId: string;
  contabilidadEnabled: boolean;
  granjaEnabled: boolean;
}

export abstract class OrgsWriterPort {
  /**
   * Crea una organización con la membership OWNER del usuario designado.
   * No siembra plan de cuentas ni tipos de documento — la siembra por módulo
   * la realiza PlatformAdminService al orquestar la transacción.
   *
   * `tx` opcional para participar en la transacción del caller.
   */
  abstract create(
    data: OrgCreateData,
    tx?: Prisma.TransactionClient,
  ): Promise<OrganizationConMemberships>;
}
