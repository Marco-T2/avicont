import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

import { EsFechaContableIso } from '@/common/validators/es-fecha-contable-iso';

export const LIST_DEFAULT_PAGE_SIZE = 50;
export const LIST_MAX_PAGE_SIZE = 100;

export class ListarCobrosQueryDto {
  @ApiPropertyOptional({ format: 'uuid', description: 'Filtra por cliente.' })
  @IsOptional()
  @IsUUID()
  contactoId?: string;

  @ApiPropertyOptional({
    example: '2026-07-01',
    description: 'Límite inferior inclusivo sobre fechaContable (YYYY-MM-DD, §4.6).',
  })
  @IsOptional()
  @EsFechaContableIso()
  fechaDesde?: string;

  @ApiPropertyOptional({
    example: '2026-07-31',
    description: 'Límite superior inclusivo sobre fechaContable (YYYY-MM-DD, §4.6).',
  })
  @IsOptional()
  @EsFechaContableIso()
  fechaHasta?: string;

  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: LIST_MAX_PAGE_SIZE, default: LIST_DEFAULT_PAGE_SIZE })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(LIST_MAX_PAGE_SIZE)
  pageSize?: number;
}
