import { EstadoComprobante, TipoComprobante } from '@prisma/client';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, IsUUID, Matches, Max, Min } from 'class-validator';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export const LIST_DEFAULT_LIMIT = 50;
export const LIST_MAX_LIMIT = 200;

export class ListarComprobantesQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  periodoFiscalId?: string;

  @ApiPropertyOptional({ enum: TipoComprobante })
  @IsOptional()
  @IsEnum(TipoComprobante)
  tipo?: TipoComprobante;

  @ApiPropertyOptional({ enum: EstadoComprobante })
  @IsOptional()
  @IsEnum(EstadoComprobante)
  estado?: EstadoComprobante;

  @ApiPropertyOptional({ example: '2026-04-01' })
  @IsOptional()
  @IsString()
  @Matches(ISO_DATE)
  fechaDesde?: string;

  @ApiPropertyOptional({ example: '2026-04-30' })
  @IsOptional()
  @IsString()
  @Matches(ISO_DATE)
  fechaHasta?: string;

  @ApiPropertyOptional({ description: 'Busca en numero y glosa (case-insensitive)' })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: LIST_DEFAULT_LIMIT, maximum: LIST_MAX_LIMIT })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(LIST_MAX_LIMIT)
  limit?: number = LIST_DEFAULT_LIMIT;
}
