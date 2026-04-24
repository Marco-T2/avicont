// Port cross-módulo DEFINIDO por users para ESCRITURAS invocadas desde otros
// módulos (hoy sólo auth.register). Superficie mínima: `create` y nada más.
// `update` y operaciones sobre el perfil quedan internas al módulo —
// consumidas por UsersService vía USER_REPOSITORY_PORT.
//
// El adapter normaliza el email (lower+trim) — el caller pasa el valor ya
// hasheado del password; el hashing es responsabilidad del caller (auth),
// users no conoce bcrypt.

export const USERS_WRITER_PORT = Symbol('USERS_WRITER_PORT');

export interface CrearUsuarioParaAuthData {
  email: string;
  hashedPassword: string;
  displayName?: string;
}

export interface UsuarioCreadoParaAuth {
  id: string;
  email: string;
}

export abstract class UsersWriterPort {
  abstract create(data: CrearUsuarioParaAuthData): Promise<UsuarioCreadoParaAuth>;
}
