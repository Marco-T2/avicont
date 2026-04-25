// Port cross-módulo DEFINIDO por memberships (dueño del dominio Membership,
// CLAUDE.md §3.7) para lecturas de memberships ACTIVAS. Superficie mínima
// (regla #5 del doc de deudas): cada método expone sólo los campos que un
// consumer concreto necesita.
//
// Consumers:
// - auth: `findActivasByUserId` (login / refreshTokens para claim `roles`)
//   y `findActivaByUserAndTenant` (switchTenant).
// - users: `findActivasConOrganizacionByUserId` (getProfile, incluye datos
//   públicos de la organización).
// - impersonation: `findForImpersonation` — necesita estado completo
//   (incluye `deactivatedAt` y `userIsActive` que los otros métodos filtran)
//   para distinguir "no es miembro" de "miembro desactivado" y emitir el
//   error específico al caller.
// - tenants: `findAllByTenant` — listado para la UI de admin del tenant
//   (incluye datos públicos del user y del custom role).
//
// No expone `permissions` ni el objeto `Organization` completo — los métodos
// devuelven DTOs proyectados al shape exacto del consumer.

export const MEMBERSHIPS_READER_PORT = Symbol('MEMBERSHIPS_READER_PORT');

export interface MembershipActivaParaAuth {
  organizationId: string;
  systemRole: string | null;
  customRoleSlug: string | null;
}

export interface MembershipActivaDeTenantParaAuth extends MembershipActivaParaAuth {
  userEmail: string;
}

export interface MembershipActivaConOrganizacion {
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  systemRole: string | null;
  customRoleSlug: string | null;
}

/**
 * Shape de membership para decisiones de impersonation. A diferencia de los
 * otros shapes, incluye explícitamente `deactivatedAt` y `userIsActive`
 * — el caller necesita distinguir "miembro activo" de "miembro desactivado"
 * o "cuenta desactivada" para emitir errores específicos (CLAUDE.md §5.6).
 */
export interface MembershipParaImpersonation {
  systemRole: string | null;
  deactivatedAt: Date | null;
  customRoleSlug: string | null;
  userEmail: string;
  userIsActive: boolean;
}

/**
 * Shape de membership para el listado de admin del tenant. Incluye los
 * datos públicos del user y del custom role que la UI necesita para
 * renderizar la fila (email, displayName, nombre del rol). Trae todas
 * las memberships del tenant — activas y desactivadas — para que el
 * admin pueda re-activarlas.
 */
export interface MembershipDeTenantParaAdmin {
  id: string;
  userId: string;
  systemRole: string | null;
  customRoleId: string | null;
  deactivatedAt: Date | null;
  createdAt: Date;
  user: { id: string; email: string; displayName: string | null };
  customRole: { id: string; slug: string; name: string } | null;
}

export abstract class MembershipsReaderPort {
  /**
   * Memberships activas (deactivatedAt null) del usuario, con rol efectivo
   * por tenant. Usado en login y en la rotación de refresh tokens.
   */
  abstract findActivasByUserId(userId: string): Promise<MembershipActivaParaAuth[]>;

  /**
   * Busca una membership activa de un usuario en un tenant específico e
   * incluye el email del usuario en el mismo roundtrip para evitar un
   * segundo query al repositorio de users. Usado en switchTenant.
   * Retorna null si no existe o si está desactivada.
   */
  abstract findActivaByUserAndTenant(
    userId: string,
    tenantId: string,
  ): Promise<MembershipActivaDeTenantParaAuth | null>;

  /**
   * Memberships activas del usuario con datos públicos de la organización
   * (id, name, slug) para renderizar el perfil. Usado por `users.getProfile`.
   */
  abstract findActivasConOrganizacionByUserId(
    userId: string,
  ): Promise<MembershipActivaConOrganizacion[]>;

  /**
   * Busca la membership de un usuario en un tenant específico devolviendo
   * el shape completo necesario para decidir si puede ser target (o admin)
   * de una sesión de impersonation — incluye `deactivatedAt` y el estado
   * `userIsActive` del User. Retorna null sólo si no existe la relación
   * (no si está desactivada). Usado por `impersonation`.
   */
  abstract findForImpersonation(
    userId: string,
    tenantId: string,
  ): Promise<MembershipParaImpersonation | null>;

  /**
   * Lista las memberships del tenant para la UI de admin (usado por
   * `tenants.getMembers`). Incluye activas Y desactivadas — el admin
   * necesita ver toda la historia para re-activar o auditar.
   */
  abstract findAllByTenant(
    tenantId: string,
  ): Promise<MembershipDeTenantParaAdmin[]>;
}
