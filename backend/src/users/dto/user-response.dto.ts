import { ApiProperty } from '@nestjs/swagger';
import type { User } from '@prisma/client';

/**
 * Shape público del usuario para respuestas HTTP. Omite `hashedPassword`
 * (y cualquier otro campo sensible que se agregue en el futuro) — el
 * mapper es allow-list, no deny-list, así que nuevas columnas del schema
 * no se filtran por accidente.
 */
export class UserResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() email!: string;
  @ApiProperty({ type: String, nullable: true }) displayName!: string | null;
  @ApiProperty() isEmailVerified!: boolean;
  @ApiProperty() isActive!: boolean;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: string;
  @ApiProperty({ type: String, format: 'date-time' }) updatedAt!: string;
}

export function toUserResponseDto(user: User): UserResponseDto {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    isEmailVerified: user.isEmailVerified,
    isActive: user.isActive,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}
