// Port cross-módulo DEFINIDO por users (dueño del dominio User, CLAUDE.md §3.7)
// para lecturas que NO pueden volcarse al repositorio interno porque otros
// módulos las invocan. Superficie mínima (regla #5 del doc de deudas):
// cada método devuelve exactamente el shape que el consumer concreto necesita.
//
// Consumers:
// - auth: `findByEmail` durante login y register-precheck — necesita
//   `hashedPassword` e `isActive` para validar credenciales, el shape es
//   `UsuarioParaAuth`.
// - memberships (invite): `findMinimalByEmail` — resuelve el user.id del
//   invitado para crear la membership. Nunca ve `hashedPassword` ni
//   `isActive`; shape `UsuarioMinimo`.
//
// `findById` no se expone — `switchTenant` y `refreshTokens` resuelven el
// user vía membership/refreshToken include, no vía users. Si algún flujo
// futuro lo necesita, se agrega acá.
//
// `findFlagsSeguridadById` se agrega para el flujo de refreshTokens del auth
// que necesita `isSuperAdmin` pero no accede al User completo (CLAUDE.md §5.2,
// REQ-SA-02). Superficie mínima: solo el flag de plataforma; si se agregan otros
// flags de seguridad futuros, extender este shape.

export const USERS_READER_PORT = Symbol('USERS_READER_PORT');

export interface UsuarioParaAuth {
  id: string;
  email: string;
  hashedPassword: string;
  isActive: boolean;
  isSuperAdmin: boolean;
}

/**
 * Proyección pública de `User` para callers que sólo necesitan identificar
 * al usuario (memberships.invite). Sin campos sensibles (`hashedPassword`)
 * ni flags internos (`isActive`); si otro consumer necesita `isActive`
 * extender con una anotación clara, no widenar este shape.
 */
export interface UsuarioMinimo {
  id: string;
  email: string;
  displayName: string | null;
}

/**
 * Proyección mínima de seguridad para el flujo de renovación de tokens.
 * Expone solo los flags de plataforma que deben reflectarse en el JWT.
 */
export interface UsuarioFlagsSeguridad {
  isSuperAdmin: boolean;
}

export abstract class UsersReaderPort {
  abstract findByEmail(email: string): Promise<UsuarioParaAuth | null>;

  /**
   * Lookup del user por email sin exponer campos sensibles. Usado hoy por
   * `memberships.invite` para resolver el user.id del invitado. Normaliza
   * el email (lowercase + trim) antes de consultar, mismo contrato que
   * `findByEmail`.
   */
  abstract findMinimalByEmail(email: string): Promise<UsuarioMinimo | null>;

  /**
   * Devuelve los flags de seguridad del usuario por id. Usado en el flujo
   * de refreshTokens para propagar `isSuperAdmin` sin un segundo round-trip
   * al objeto User completo. Returns null si el usuario no existe.
   */
  abstract findFlagsSeguridadById(id: string): Promise<UsuarioFlagsSeguridad | null>;
}
