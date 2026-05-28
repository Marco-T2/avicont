import { IsOptional, IsString, MaxLength, IsEnum } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

import { TipoEmpresa } from '@/common/domain/enums';

const Plan = {
  FREE: 'FREE',
  PRO: 'PRO',
} as const;

const TenantStatus = {
  ACTIVE: 'ACTIVE',
  SUSPENDED: 'SUSPENDED',
} as const;

type PlanType = (typeof Plan)[keyof typeof Plan];
type TenantStatusType = (typeof TenantStatus)[keyof typeof TenantStatus];

export class UpdateTenantDto {
  @ApiPropertyOptional({ example: 'New Name', maxLength: 100, description: 'Organization name' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional({ enum: ['FREE', 'PRO'], description: 'Subscription plan' })
  @IsOptional()
  @IsEnum(Plan)
  plan?: PlanType;

  @ApiPropertyOptional({ enum: ['ACTIVE', 'SUSPENDED'], description: 'Tenant status' })
  @IsOptional()
  @IsEnum(TenantStatus)
  status?: TenantStatusType;

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
