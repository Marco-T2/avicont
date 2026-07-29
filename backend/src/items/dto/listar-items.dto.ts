import { ApiPropertyOptional } from '@nestjs/swagger';
import { TipoItem } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import { IsEnum, IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

// Los query params llegan como string; se convierten antes de validar.
// Mismo patrón que ListarContactosQueryDto.
const toBoolOrAll = ({ value }: { value: unknown }): boolean | 'all' | undefined => {
  if (value === 'all') return 'all';
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value === 'boolean') return value;
  if (value === 'true' || value === '1') return true;
  if (value === 'false' || value === '0') return false;
  return undefined;
};

export const LIST_DEFAULT_PAGE_SIZE = 50;
export const LIST_MAX_PAGE_SIZE = 100;

export class ListarItemsQueryDto {
  @ApiPropertyOptional({ description: 'Búsqueda parcial case-insensitive sobre nombre y código.' })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({ enum: TipoItem })
  @IsOptional()
  @IsEnum(TipoItem)
  tipo?: TipoItem;

  @ApiPropertyOptional({
    description: "true (default) sólo activos, false sólo inactivos, 'all' ambos.",
  })
  @IsOptional()
  @Transform(toBoolOrAll)
  @IsIn([true, false, 'all'])
  activo?: boolean | 'all';

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
