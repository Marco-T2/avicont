import type { User } from '@prisma/client';

export const USER_REPOSITORY_PORT = Symbol('USER_REPOSITORY_PORT');

export interface CrearUsuarioData {
  email: string;
  hashedPassword: string;
  displayName?: string;
}

export interface ActualizarUsuarioData {
  displayName?: string;
}

/**
 * Contrato del repositorio de usuarios. Superficie interna completa del
 * módulo — los consumers cross-module usan los ports reducidos (reader /
 * writer) según CLAUDE.md §3.7 y regla #5 del doc de deudas.
 */
export interface UserRepositoryPort {
  findByEmail(email: string): Promise<User | null>;
  findById(id: string): Promise<User | null>;
  create(data: CrearUsuarioData): Promise<User>;
  update(id: string, data: ActualizarUsuarioData): Promise<User>;
}
