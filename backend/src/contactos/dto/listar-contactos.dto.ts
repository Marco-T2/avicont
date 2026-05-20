import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

// Query params llegan como strings. Convertimos a boolean/number con
// @Transform/@Type antes de validar. Patrón ya usado en ListarCuentasQueryDto.
const toBool = ({ value }: { value: unknown }): boolean | undefined => {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value === 'boolean') return value;
  if (value === 'true' || value === '1') return true;
  if (value === 'false' || value === '0') return false;
  return undefined;
};

export const LIST_DEFAULT_PAGE_SIZE = 50;
export const LIST_MAX_PAGE_SIZE = 100;

export class ListarContactosQueryDto {
  @ApiPropertyOptional({
    description:
      'Búsqueda ILIKE parcial sobre razonSocial y nombreComercial (OR). Usa GIN trigram.',
  })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({ description: 'Match exacto sobre documento' })
  @IsOptional()
  @IsString()
  documento?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  esCliente?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  esProveedor?: boolean;

  @ApiPropertyOptional({
    description:
      'true (default) → solo activos; false → solo inactivos. Si no viene, default true.',
  })
  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  activo?: boolean;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({
    default: LIST_DEFAULT_PAGE_SIZE,
    maximum: LIST_MAX_PAGE_SIZE,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(LIST_MAX_PAGE_SIZE)
  pageSize?: number;
}
