import { EstadoComprobante, TipoComprobante } from '@prisma/client';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  Min,
} from 'class-validator';

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

  @ApiPropertyOptional({
    default: false,
    description: 'Incluir comprobantes anulados en el listado (default: false)',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => {
    if (value === 'true' || value === true) return true;
    if (value === 'false' || value === false) return false;
    return value;
  })
  @IsBoolean()
  incluirAnulados?: boolean;
}

/**
 * Query DTO para el endpoint de export.
 * Igual que ListarComprobantesQueryDto SIN page/limit — exporta todo el rango filtrado.
 * Se define plano (no herencia con OmitType) para evitar acoplamiento entre los dos DTOs.
 */
export class ExportarComprobantesQueryDto {
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

  @ApiPropertyOptional({
    default: false,
    description: 'Incluir comprobantes anulados en el export (default: false)',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => {
    if (value === 'true' || value === true) return true;
    if (value === 'false' || value === false) return false;
    return value;
  })
  @IsBoolean()
  incluirAnulados?: boolean;
}
