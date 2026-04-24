// Port cross-módulo DEFINIDO por memberships (dueño del dominio Membership,
// CLAUDE.md §3.7) para lecturas orientadas a AUTENTICACIÓN. Superficie mínima
// (regla #5 del doc de deudas): hoy sólo auth lo consume, y sólo necesita
// resolver el rol efectivo por tenant para armar el claim `roles` del JWT.
//
// No expone `permissions` ni el objeto `Organization` completo — esos siguen
// dentro del módulo memberships o se agregan cuando un consumer real los
// requiera.

export const MEMBERSHIPS_READER_PORT = Symbol('MEMBERSHIPS_READER_PORT');

export interface MembershipActivaParaAuth {
  organizationId: string;
  systemRole: string | null;
  customRoleSlug: string | null;
}

export interface MembershipActivaDeTenantParaAuth extends MembershipActivaParaAuth {
  userEmail: string;
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
}
