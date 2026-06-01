import { IsOptional, IsString, MaxLength, IsEnum } from 'class-validator';
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
