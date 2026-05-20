// Port cross-módulo DEFINIDO por custom-roles (dueño del dominio
// `CustomRole`, CLAUDE.md §3.7) para lecturas invocadas desde otros
// módulos. Superficie mínima (regla #5 del doc de deudas): expone
// SOLO lo que otros módulos necesitan hoy; cualquier operación interna
// (list, findById, findBySlug, listMembers...) vive en el repo port.
//
// Consumers:
// - memberships: `belongsToTenant` para validar que un `customRoleId`
//   pasado al invite/update de membership pertenece al tenant activo.
// - invitations: mismo caso al crear una invitation con customRoleId.

export const CUSTOM_ROLES_READER_PORT = Symbol('CUSTOM_ROLES_READER_PORT');

export abstract class CustomRolesReaderPort {
  /**
   * ¿Existe un CustomRole con este ID que pertenezca al tenant dado?
   *
   * - `true`: existe y coincide el tenant.
   * - `false`: no existe, o pertenece a otro tenant.
   *
   * El caller NO distingue los dos casos negativos — ambos se reportan
   * con el mismo error de dominio (`CustomRoleInvalidoParaTenantError`
   * en memberships, equivalente en invitations) para no filtrar la
   * existencia de IDs cross-tenant.
   */
  abstract belongsToTenant(customRoleId: string, tenantId: string): Promise<boolean>;
}
