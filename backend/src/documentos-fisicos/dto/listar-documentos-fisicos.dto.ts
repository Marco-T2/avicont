import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

export const LIST_DEFAULT_PAGE_SIZE = 20;
export const LIST_MAX_PAGE_SIZE = 100;

/**
 * Filtro de estado derivado del documento físico.
 * Mapeado al campo `estado` del puerto: SUELTO→libre, EN_BORRADOR→asociado,
 * CONTABILIZADO→contabilizado.
 */
export enum EstadoAsociacion {
  SUELTO = 'SUELTO',
  EN_BORRADOR = 'EN_BORRADOR',
  CONTABILIZADO = 'CONTABILIZADO',
}

export class ListarDocumentosFisicosQueryDto {
  @ApiPropertyOptional({
    description: 'Filtrar por tipo de documento físico.',
    format: 'uuid',
  })
  @IsOptional()
  @IsUUID()
  tipoDocumentoFisicoId?: string;

  @ApiPropertyOptional({
    description: 'Filtrar desde esta fecha de emisión (inclusive). Formato YYYY-MM-DD.',
    example: '2026-01-01',
  })
  @IsOptional()
  @IsDateString()
  fechaDesde?: string;

  @ApiPropertyOptional({
    description: 'Filtrar hasta esta fecha de emisión (inclusive). Formato YYYY-MM-DD.',
    example: '2026-12-31',
  })
  @IsOptional()
  @IsDateString()
  fechaHasta?: string;

  @ApiPropertyOptional({
    description: 'Filtrar por contacto asociado.',
    format: 'uuid',
  })
  @IsOptional()
  @IsUUID()
  contactoId?: string;

  @ApiPropertyOptional({
    description:
      'Filtrar por estado de asociación: SUELTO (sin comprobantes), EN_BORRADOR (en borradores), CONTABILIZADO (en contabilizados).',
    enum: EstadoAsociacion,
  })
  @IsOptional()
  @IsEnum(EstadoAsociacion)
  estadoAsociacion?: EstadoAsociacion;

  @ApiPropertyOptional({
    description: 'Búsqueda parcial sobre el número del documento (case-insensitive).',
  })
  @IsOptional()
  @IsString()
  numero?: string;

  @ApiPropertyOptional({
    description:
      'Cuando true, devuelve SOLO documentos que no están consumidos por ningún comprobante CONTABILIZADO. ' +
      'Preserva documentos sueltos y los que están en borradores.',
    type: Boolean,
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => value === 'true' || value === true)
  @IsBoolean()
  disponibleParaAsociar?: boolean;

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
