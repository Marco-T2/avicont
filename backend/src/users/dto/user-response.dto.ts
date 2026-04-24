import type { User } from '@prisma/client';

/**
 * Shape público del usuario para respuestas HTTP. Omite `hashedPassword`
 * (y cualquier otro campo sensible que se agregue en el futuro) — el
 * mapper es allow-list, no deny-list, así que nuevas columnas del schema
 * no se filtran por accidente.
 */
export interface UserResponseDto {
  id: string;
  email: string;
  displayName: string | null;
  isEmailVerified: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export function toUserResponseDto(user: User): UserResponseDto {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    isEmailVerified: user.isEmailVerified,
    isActive: user.isActive,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}
