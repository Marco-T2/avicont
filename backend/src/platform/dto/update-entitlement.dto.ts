import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsOptional } from 'class-validator';
import { Plan } from '@prisma/client';

export class UpdateEntitlementDto {
  @ApiPropertyOptional({
    enum: Plan,
    description: 'Plan de suscripción de la organización.',
    example: Plan.PRO,
  })
  @IsEnum(Plan)
  @IsOptional()
  plan?: Plan;

  @ApiPropertyOptional({
    description:
      'Activa o desactiva el módulo de contabilidad. No puede ser true si granjaEnabled es true.',
    example: true,
  })
  @IsBoolean()
  @IsOptional()
  contabilidadEnabled?: boolean;

  @ApiPropertyOptional({
    description:
      'Activa o desactiva el módulo de granja. No puede ser true si contabilidadEnabled es true.',
    example: false,
  })
  @IsBoolean()
  @IsOptional()
  granjaEnabled?: boolean;
}
