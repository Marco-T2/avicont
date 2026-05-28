import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

import { ClaseCuenta } from '@/common/domain/enums';

import { SubClaseCuenta } from '../domain/enums';

const toBool = ({ value }: { value: unknown }): boolean | undefined => {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value === 'boolean') return value;
  if (value === 'true' || value === '1') return true;
  if (value === 'false' || value === '0') return false;
  return undefined;
};

export class ListarCuentasQueryDto {
  @ApiPropertyOptional({ enum: ClaseCuenta })
  @IsOptional()
  @IsEnum(ClaseCuenta)
  claseCuenta?: ClaseCuenta;

  @ApiPropertyOptional({ enum: SubClaseCuenta })
  @IsOptional()
  @IsEnum(SubClaseCuenta)
  subClaseCuenta?: SubClaseCuenta;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  activa?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  esDetalle?: boolean;

  @ApiPropertyOptional({ description: 'Busca en nombre o codigoInterno' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 25, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}
