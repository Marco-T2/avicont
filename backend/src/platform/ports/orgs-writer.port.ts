// Puerto cross-módulo DEFINIDO por platform (consumidor) para escribir organizaciones.
// El módulo `tenants` registra el adapter concreto y lo exporta vía este token
// (CLAUDE.md §3.3 — no importación directa cross-module).

import type { Organization, OrganizationStatus, Plan, Prisma } from '@prisma/client';

import type { OrganizationConMemberships } from '@/tenants/ports/tenant.repository.port';

export const ORGS_WRITER_PORT = Symbol('ORGS_WRITER_PORT');

export interface OrgCreateData {
  name: string;
  slug: string;
  ownerUserId: string;
  contabilidadEnabled: boolean;
  granjaEnabled: boolean;
}

export interface OrgEntitlementData {
  plan?: Plan;
  contabilidadEnabled?: boolean;
  granjaEnabled?: boolean;
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

  /**
   * Actualiza el status de una organización (REQ-SA-14).
   * Retorna null si la org no existe.
   */
  abstract updateStatus(id: string, status: OrganizationStatus): Promise<Organization | null>;

  /**
   * Actualiza el plan y/o verticales de una organización (REQ-SA-15).
   * Retorna null si la org no existe.
   * La validación de exclusividad de vertical la hace el service antes de llamar este método.
   */
  abstract updateEntitlement(id: string, data: OrgEntitlementData): Promise<Organization | null>;
}
