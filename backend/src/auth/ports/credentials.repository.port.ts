export const CREDENTIALS_REPOSITORY_PORT = Symbol('CREDENTIALS_REPOSITORY_PORT');

/**
 * Refresh token persistido y activo (no revocado, no expirado), tal como lo
 * necesita AuthService para rotar el token. Incluye `userEmail` para evitar
 * un segundo roundtrip al repositorio de users al armar el nuevo JWT.
 */
export interface StoredRefreshToken {
  id: string;
  userId: string;
  userEmail: string;
  organizationId: string | null;
  familyId: string;
}

export interface CrearCredencialData {
  tokenHash: string;
  userId: string;
  organizationId?: string;
  familyId: string;
  expiresAt: Date;
}

/**
 * Contrato del repositorio de refresh tokens. Abstracción de `prisma.refreshToken.*`
 * desde la perspectiva de AuthService. Superficie mínima para login / rotación /
 * logout (CLAUDE.md §5.3, regla #5 del doc de deudas). Detección de reuso y
 * `revokeByFamily` quedan para Fase 0.6.
 */
export interface CredentialsRepositoryPort {
  /** Busca un refresh token NO revocado y NO expirado. */
  findActiveByHash(hash: string): Promise<StoredRefreshToken | null>;

  /** Persiste un nuevo refresh token. */
  create(data: CrearCredencialData): Promise<void>;

  /** Marca un token específico como revocado. Usado en rotación. */
  revokeById(id: string, reason: string): Promise<void>;

  /** Marca todos los tokens con ese hash como revocados. Usado en logout. */
  revokeByHash(hash: string, reason: string): Promise<void>;
}
