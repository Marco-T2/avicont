// Puerto del repositorio del módulo `tenants`. Expone la superficie de
// persistencia para que `TenantsService` nunca toque Prisma directamente
// (Anti-31 CLAUDE.md §8.1, regla #4 del doc de deudas).
//
// Superficie mínima — sólo los métodos que el service consume. Nada de
// `findMany` genérico ni acceso a relaciones que el caller no necesita.

import type {
  Membership,
  Organization,
  OrganizationStatus,
  Plan,
  Prisma,
  TipoEmpresa,
} from '@prisma/client';

export const TENANT_REPOSITORY_PORT = Symbol('TENANT_REPOSITORY_PORT');

// ============================================================
// Shapes de datos
// ============================================================

/**
 * Organization con la membership inicial del OWNER incluida — la respuesta
 * del flujo `create` la consume el frontend para confirmar el provisioning.
 */
export interface OrganizationConMemberships extends Organization {
  memberships: Membership[];
}

export interface TenantCreateData {
  slug: string;
  name: string;
  ownerUserId: string;
  /** Derivado del módulo elegido en `CreateTenantDto.modulo` (Design D1). */
  contabilidadEnabled: boolean;
  /** Derivado del módulo elegido en `CreateTenantDto.modulo` (Design D1). */
  granjaEnabled: boolean;
}

export interface TenantUpdateData {
  name?: string;
  plan?: Plan;
  status?: OrganizationStatus;
  tipoEmpresaPrincipal?: TipoEmpresa;
}

export interface TenantFeatures {
  contabilidadEnabled: boolean;
  granjaEnabled: boolean;
}

export interface TenantFeaturesUpdate {
  contabilidadEnabled?: boolean;
  granjaEnabled?: boolean;
}

// ============================================================
// Port
// ============================================================

export abstract class TenantRepositoryPort {
  /**
   * Crea una organización + la membership inicial del OWNER en una sola
   * operación atómica (nested write de Prisma). Asume que el caller ya
   * validó que el slug no existe.
   *
   * `tx` es opcional para mantener compatibilidad. Cuando se provee, la
   * operación participa de la transacción del caller (Design D6).
   */
  abstract create(
    data: TenantCreateData,
    tx?: Prisma.TransactionClient,
  ): Promise<OrganizationConMemberships>;

  /**
   * Busca por id. Retorna null si no existe — el service lo traduce a
   * `TenantNoEncontradoError`.
   */
  abstract findById(id: string): Promise<Organization | null>;

  /**
   * Busca por slug. Retorna null si no existe.
   */
  abstract findBySlug(slug: string): Promise<Organization | null>;

  /**
   * Chequeo barato de unicidad usado antes del create. Convive con la
   * UNIQUE constraint en BD (defense in depth, CLAUDE.md §4.8): el
   * service lo usa para emitir un 409 amigable; la constraint cubre la
   * race condition residual.
   */
  abstract existsBySlug(slug: string): Promise<boolean>;

  /**
   * Actualiza campos editables. Asume que el caller ya validó las
   * reglas de dominio (e.g. inmutabilidad de tipoEmpresaPrincipal).
   */
  abstract update(id: string, data: TenantUpdateData): Promise<Organization>;

  /**
   * Lee sólo los flags de features (proyección barata, evita pull de
   * la organización completa para `GET /tenants/current/features`).
   * Retorna null si la organización no existe.
   */
  abstract findFeatures(id: string): Promise<TenantFeatures | null>;

  /**
   * Actualiza los flags de features. Acepta un patch parcial — sólo
   * los campos definidos se aplican. El caller invalida la cache RBAC
   * después de la escritura.
   */
  abstract updateFeatures(id: string, data: TenantFeaturesUpdate): Promise<TenantFeatures>;
}
