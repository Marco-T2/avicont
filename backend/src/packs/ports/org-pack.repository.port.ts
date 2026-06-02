import type { Pack } from '../domain/pack';

export const ORG_PACK_REPOSITORY_PORT = Symbol('ORG_PACK_REPOSITORY_PORT');

/**
 * Fila de entitlement de un pack para una org, con la activación embebida.
 * La existencia de la fila significa "la plataforma habilitó este pack a esta
 * org"; la columna `activo` ES la activación (frontera estructural §4.5 diseño).
 */
export interface OrgPackEntitlementRow {
  id: string;
  organizationId: string;
  packId: string;
  activo: boolean;
  habilitadoPorUserId: string;
}

/**
 * Fila de entitlement enriquecida con los datos del pack del catálogo. Útil
 * para el panel super-admin / Owner (clave + nombre + estado de activación).
 */
export interface OrgPackEntitlementConPack extends OrgPackEntitlementRow {
  pack: Pack;
}

/**
 * Puerto del repositorio de entitlement + activación de packs por org.
 * Multi-tenancy defense in depth (CLAUDE.md §4.2): TODA query filtra por
 * `organizationId`. Lo implementa el adapter Prisma.
 */
export abstract class OrgPackRepositoryPort {
  /**
   * Crea la fila de entitlement con `activo = false` (habilitar ≠ activar).
   * La constraint `@@unique([organizationId, packId])` rechaza el doble
   * entitlement bajo concurrencia (defense in depth §4.8).
   */
  abstract habilitar(
    organizationId: string,
    packId: string,
    habilitadoPorUserId: string,
  ): Promise<OrgPackEntitlementRow>;

  /** Borra la fila de entitlement de la org (revoca también la activación). */
  abstract revocar(organizationId: string, packId: string): Promise<void>;

  /**
   * Setea `activo` sobre la fila de entitlement de la org. El service valida la
   * frontera (sin fila → PackNoHabilitadoError) antes de llamar aquí.
   */
  abstract setActivo(
    organizationId: string,
    packId: string,
    activo: boolean,
  ): Promise<OrgPackEntitlementRow>;

  /** Devuelve la fila de entitlement de un pack para la org, o null si no existe. */
  abstract findByOrgYPack(
    organizationId: string,
    packId: string,
  ): Promise<OrgPackEntitlementRow | null>;

  /** Lista todos los entitlements de la org enriquecidos con el pack del catálogo. */
  abstract findByOrg(organizationId: string): Promise<OrgPackEntitlementConPack[]>;

  /** Devuelve las claves de los packs ACTIVOS de la org (activo = true). */
  abstract findClavesActivasByOrg(organizationId: string): Promise<string[]>;
}
