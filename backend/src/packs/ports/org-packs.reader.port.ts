export const ORG_PACKS_READER_PORT = Symbol('ORG_PACKS_READER_PORT');

/**
 * Superficie pública del módulo `packs/` para consumo CROSS-MÓDULO (core §3.3/§3.7).
 * Otros módulos (el `PackEnabledGuard` en common, `MePermissionsResponse`, el
 * filtrado RBAC del catálogo asignable) leen los packs activos de una org SOLO a
 * través de este puerto — nunca importan `packs/adapters/`.
 *
 * El contrato es deliberadamente mínimo: devuelve las CLAVES de los packs activos.
 */
export abstract class OrgPacksReaderPort {
  /**
   * Devuelve las claves de los packs ACTIVOS de la organización (los que el
   * Owner prendió Y la plataforma habilitó). Org sin packs activos → `[]`.
   */
  abstract packsActivos(organizationId: string): Promise<string[]>;

  /** Atajo: ¿está ese pack (por clave) activo para la organización? */
  abstract estaActivo(organizationId: string, clave: string): Promise<boolean>;
}
