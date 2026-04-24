// Port cross-módulo DEFINIDO por users (dueño del dominio User, CLAUDE.md §3.7)
// para lecturas orientadas a AUTENTICACIÓN. Superficie mínima (regla #5 del
// doc de deudas): hoy sólo auth lo consume, y sólo necesita resolver email
// durante login/register-precheck.
//
// No incluye `findById` — `switchTenant` y `refreshTokens` resuelven el user
// vía prisma.membership/refreshToken include, no vía users. Cuando la sesión B
// (auth hexagonal) saque esos flujos de Prisma directo, se extiende acá.

export const USERS_READER_PORT = Symbol('USERS_READER_PORT');

export interface UsuarioParaAuth {
  id: string;
  email: string;
  hashedPassword: string;
  isActive: boolean;
}

export abstract class UsersReaderPort {
  abstract findByEmail(email: string): Promise<UsuarioParaAuth | null>;
}
