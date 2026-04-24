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
}
