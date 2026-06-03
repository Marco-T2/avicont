import { IsOptional, IsString, MaxLength, IsEnum, ValidateIf } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

import { TipoEmpresa } from '@/common/domain/enums';

// `plan` y `status` son entitlement: los administra la plataforma (super-admin),
// nunca el Owner de la org. Por eso NO viven en este DTO — ver
// docs/disenos/super-admin-plataforma.md §8. El Owner solo edita el perfil de
// su organización (name, tipoEmpresaPrincipal).
export class UpdateTenantDto {
  @ApiPropertyOptional({ example: 'New Name', maxLength: 100, description: 'Organization name' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 200, description: 'Razón social (nombre legal)' })
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsString()
  @MaxLength(200)
  razonSocial?: string | null;

  // RND 10-0025-14: el NIT tiene entre 7 y 12 dígitos numéricos.
  // La validación de formato (regex) ocurre en el service para emitir el code
  // estable TENANT_NIT_INVALIDO. El DTO solo valida que sea string o null.
  @ApiPropertyOptional({ type: String, nullable: true, description: 'NIT de la organización (7-12 dígitos)' })
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsString()
  nit?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 300, description: 'Dirección fiscal' })
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsString()
  @MaxLength(300)
  direccion?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 150, description: 'Representante legal' })
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsString()
  @MaxLength(150)
  representanteLegal?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 30, description: 'Teléfono de contacto' })
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsString()
  @MaxLength(30)
  telefono?: string | null;

  // El formato de email se valida en el service con TenantEmailInvalidoError
  // para emitir el code estable TENANT_EMAIL_INVALIDO (decisión de validación).
  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 254, description: 'Email de contacto' })
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsString()
  @MaxLength(254)
  email?: string | null;

  @ApiPropertyOptional({
    enum: [
      'COMERCIAL',
      'SERVICIOS',
      'TRANSPORTE',
      'INDUSTRIAL',
      'PETROLERA',
      'CONSTRUCCION',
      'AGROPECUARIA',
      'MINERA',
    ],
    description:
      'Tipo de empresa principal (determina el mesInicio del cierre fiscal según Ley 843 art. 46). Inmutable una vez creada la primera gestión fiscal.',
  })
  @IsOptional()
  @IsEnum({
    COMERCIAL: 'COMERCIAL',
    SERVICIOS: 'SERVICIOS',
    TRANSPORTE: 'TRANSPORTE',
    INDUSTRIAL: 'INDUSTRIAL',
    PETROLERA: 'PETROLERA',
    CONSTRUCCION: 'CONSTRUCCION',
    AGROPECUARIA: 'AGROPECUARIA',
    MINERA: 'MINERA',
  })
  tipoEmpresaPrincipal?: TipoEmpresa;
}
