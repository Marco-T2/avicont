import { ArrayNotEmpty, IsArray, IsOptional, IsString, Length, Matches } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateCustomRoleDto {
  @ApiProperty({
    example: 'cobrador-aux',
    description: 'Slug único dentro de la organización (kebab-case)',
  })
  @IsString()
  @Length(2, 50)
  @Matches(/^[a-z0-9]+(-[a-z0-9]+)*$/, { message: 'slug debe ser kebab-case alfanumérico' })
  slug!: string;

  @ApiProperty({ example: 'Cobrador / Auxiliar' })
  @IsString()
  @Length(2, 80)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(0, 500)
  description?: string;

  @ApiProperty({
    type: [String],
    example: [
      'contabilidad.ventas.read',
      'contabilidad.ventas.create',
      'contabilidad.compras.read',
    ],
    description:
      'Patrones de permiso. Aceptan wildcards modulo.*, modulo.submodulo.*, modulo.*.accion. Ver catálogo en GET /api/permissions.',
  })
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  permissions!: string[];
}
