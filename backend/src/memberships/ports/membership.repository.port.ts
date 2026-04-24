// Puerto del repositorio del módulo `memberships`. Expone la superficie
// de persistencia para que `MembershipsService` nunca toque Prisma
// directamente (Anti-31 CLAUDE.md §8.1, regla #4 del doc de deudas).
//
// Convive con `MEMBERSHIPS_READER_PORT` (cross-módulo, §2.1 Sesión B):
// este port es INTERNO del módulo — auth/users consumen el reader mínimo,
// no este repo completo.

import type { Membership, Prisma, SystemRole } from '@prisma/client';

export const MEMBERSHIP_REPOSITORY_PORT = Symbol('MEMBERSHIP_REPOSITORY_PORT');

// ============================================================
// Tipos de datos aceptados por el repo
// ============================================================

export interface MembershipCreateData {
  userId: string;
  systemRole: SystemRole | null;
  customRoleId: string | null;
}

export interface MembershipUpdateRolData {
  systemRole: SystemRole | null;
  customRoleId: string | null;
}

// ============================================================
// Tipo de retorno con relaciones
// ============================================================

/**
 * Membership con las relaciones mínimas que el controller devuelve al
 * frontend en el flujo `invite`: datos públicos del user y del custom role
 * si aplica. Centralizar el shape acá evita que el adapter decida la forma
 * y que el controller la componga por su cuenta.
 */
export interface MembershipConUserYRol extends Membership {
  user: { id: string; email: string; displayName: string | null };
  customRole: { id: string; slug: string; name: string } | null;
}

// ============================================================
// Port
// ============================================================

export abstract class MembershipRepositoryPort {
  /**
   * Crea una membership nueva. Retorna la entidad con `user` + `customRole`
   * incluidos para que el controller pueda responder con la info que la
   * UI renderiza sin un roundtrip adicional.
   *
   * Asume que el caller ya validó:
   *  - el user existe,
   *  - no hay membership previa para (tenantId, userId),
   *  - si `customRoleId` viene, pertenece al tenant.
   */
  abstract create(
    tenantId: string,
    data: MembershipCreateData,
    tx?: Prisma.TransactionClient,
  ): Promise<MembershipConUserYRol>;

  /**
   * Actualiza el par (systemRole, customRoleId) de la membership. Asume
   * que el caller ya validó las reglas de dominio (no auto-degradación,
   * no último OWNER, customRoleId del tenant, etc.).
   */
  abstract updateRol(
    tenantId: string,
    membershipId: string,
    data: MembershipUpdateRolData,
    tx?: Prisma.TransactionClient,
  ): Promise<Membership>;

  /**
   * Elimina una membership por ID. Retorna la entidad borrada para que el
   * caller pueda extraer `userId` e invalidar su cache RBAC post-delete.
   */
  abstract deleteById(
    tenantId: string,
    membershipId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<Membership>;

  /**
   * Elimina la membership del user en el tenant (flujo `leave`). Retorna
   * la entidad borrada.
   */
  abstract deleteByUserAndTenant(
    tenantId: string,
    userId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<Membership>;

  /**
   * Lee una membership por ID, scopeada al tenant (defense in depth
   * multi-tenancy, CLAUDE.md §4.2). Retorna null si no existe o
   * pertenece a otro tenant.
   */
  abstract findById(
    tenantId: string,
    membershipId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<Membership | null>;

  /**
   * Lee la membership del user en el tenant por clave compuesta
   * (`organizationId`, `userId`). Usado para el check "ya es miembro" en
   * invite y para resolver el target de `leave`.
   */
  abstract findByUserAndTenant(
    tenantId: string,
    userId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<Membership | null>;

  /**
   * Cuenta OWNERs activos del tenant. Usado por el check
   * "no eliminar/degradar al último OWNER" antes de `deleteById`,
   * `deleteByUserAndTenant` o `updateRol`.
   */
  abstract countOwners(
    tenantId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<number>;
}
