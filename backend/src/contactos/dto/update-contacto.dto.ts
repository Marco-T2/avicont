import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEmail, IsOptional, IsString, Length } from 'class-validator';

/**
 * PATCH del contacto. Todos los campos opcionales.
 *
 * `activo` NO va acá — el toggle vive en endpoints dedicados
 * (`POST /:id/desactivar` y `POST /:id/reactivar`). Un PATCH genérico
 * no puede desactivar un contacto por accidente.
 */
export class UpdateContactoDto {
  @ApiPropertyOptional({ minLength: 2, maxLength: 200 })
  @IsOptional()
  @IsString()
  @Length(2, 200)
  razonSocial?: string;

  @ApiPropertyOptional({ type: String, maxLength: 200, nullable: true })
  @IsOptional()
  @IsString()
  @Length(0, 200)
  nombreComercial?: string | null;

  @ApiPropertyOptional({ type: String, maxLength: 50, nullable: true })
  @IsOptional()
  @IsString()
  @Length(0, 50)
  documento?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  esCliente?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  esProveedor?: boolean;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @IsEmail()
  @Length(0, 200)
  email?: string | null;

  @ApiPropertyOptional({ type: String, maxLength: 50, nullable: true })
  @IsOptional()
  @IsString()
  @Length(0, 50)
  telefono?: string | null;

  @ApiPropertyOptional({ type: String, maxLength: 500, nullable: true })
  @IsOptional()
  @IsString()
  @Length(0, 500)
  direccion?: string | null;
}
