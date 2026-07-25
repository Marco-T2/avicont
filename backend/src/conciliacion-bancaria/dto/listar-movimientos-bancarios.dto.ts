import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { EstadoMovimientoBancario, Moneda } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, IsUUID, Matches, Max, Min } from 'class-validator';

import type { ListadoMovimientosBancarios } from '../movimientos-bancarios.service';
import {
  MovimientoConciliacionDto,
  MOTIVOS_VINCULO_ROTO,
} from './workspace-conciliacion-response.dto';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
// §4.5 core: el dinero cruza HTTP como string decimal, nunca number.
const MONTO_DECIMAL = /^\d+(\.\d{1,2})?$/;

export const LISTADO_DEFAULT_LIMIT = 50;
export const LISTADO_MAX_LIMIT = 200;

/**
 * Query del verificador `GET /api/movimientos-bancarios` (REQ-VMB-01/03/04).
 * Rango OBLIGATORIO (molde workspace): sin acotarlo la lectura crecería sin
 * techo. Fechas `YYYY-MM-DD` calendario puro (§4.6).
 */
export class ListarMovimientosBancariosQueryDto {
  @ApiProperty({ example: '2026-06-01', description: 'Inclusive.' })
  @Matches(ISO_DATE, { message: 'desde debe tener formato YYYY-MM-DD' })
  desde!: string;

  @ApiProperty({ example: '2026-06-30', description: 'Inclusive.' })
  @Matches(ISO_DATE, { message: 'hasta debe tener formato YYYY-MM-DD' })
  hasta!: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  cuentaBancariaId?: string;

  @ApiPropertyOptional({
    enum: EstadoMovimientoBancario,
    description:
      'Filtra por la columna cacheada. Activa la auditoría de vínculos rotos (REQ-VMB-07). Sin este parámetro se devuelve TODO (REQ-VMB-02).',
  })
  @IsOptional()
  @IsEnum(EstadoMovimientoBancario)
  estado?: EstadoMovimientoBancario;

  @ApiPropertyOptional({ example: '100.00', description: 'Monto mínimo inclusive, string (§4.5).' })
  @IsOptional()
  @Matches(MONTO_DECIMAL, {
    message: 'montoDesde debe ser un decimal positivo con hasta 2 decimales',
  })
  montoDesde?: string;

  @ApiPropertyOptional({ example: '500.00', description: 'Monto máximo inclusive, string (§4.5).' })
  @IsOptional()
  @Matches(MONTO_DECIMAL, {
    message: 'montoHasta debe ser un decimal positivo con hasta 2 decimales',
  })
  montoHasta?: string;

  @ApiPropertyOptional({
    description:
      'Substring sobre la descripción, insensible a mayúsculas y diacríticos (REQ-VMB-03).',
  })
  @IsOptional()
  @IsString()
  glosa?: string;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: LISTADO_DEFAULT_LIMIT, maximum: LISTADO_MAX_LIMIT })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(LISTADO_MAX_LIMIT)
  limit?: number = LISTADO_DEFAULT_LIMIT;
}

// ============================================================
// Response — montos STRING (§4.5), fechas YYYY-MM-DD (§4.6)
// ============================================================

export class MovimientoVerificadorDto extends MovimientoConciliacionDto {
  @ApiProperty({ format: 'uuid' }) cuentaBancariaId!: string;
  @ApiProperty({
    type: Number,
    nullable: true,
    description:
      'Índice 0-based dentro del orden cronológico del archivo importado (REQ-CB-21). null = importado antes del change o secuencia no monótona.',
  })
  ordenFisico!: number | null;
}

export class TotalMonedaDto {
  @ApiProperty({ enum: Moneda }) moneda!: Moneda;
  @ApiProperty({ example: '300.50', description: 'String (§4.5). Sin conversión a BOB.' })
  totalDebitos!: string;
  @ApiProperty({ example: '50.00', description: 'String (§4.5). Sin conversión a BOB.' })
  totalCreditos!: string;
  @ApiProperty() cantidad!: number;
}

export class SaldoCuentaBancariaDto {
  @ApiProperty({ format: 'uuid' }) cuentaBancariaId!: string;
  @ApiProperty() alias!: string;
  @ApiProperty({ enum: Moneda }) moneda!: Moneda;
  @ApiProperty({
    type: String,
    nullable: true,
    description:
      'Saldo publicado por el banco en el último movimiento con fecha <= hasta. null honesto: sin fallback (REQ-VMB-09).',
  })
  saldo!: string | null;
  @ApiProperty({
    type: String,
    nullable: true,
    description:
      'Fecha del último movimiento importado — SIEMPRE presente si hay movimiento (REQ-VMB-08).',
  })
  fechaUltimoMovimiento!: string | null;
}

export class VinculoRotoDto {
  @ApiProperty({ format: 'uuid' }) movimientoBancarioId!: string;
  @ApiProperty({ format: 'uuid' }) cuentaBancariaId!: string;
  @ApiProperty({ example: '2026-06-10' }) fecha!: string;
  @ApiProperty({ example: '1250.50' }) monto!: string;
  @ApiProperty({ enum: Moneda }) moneda!: Moneda;
  @ApiProperty() descripcion!: string;
  @ApiProperty({ enum: MOTIVOS_VINCULO_ROTO })
  motivo!: (typeof MOTIVOS_VINCULO_ROTO)[number];
}

export class AuditoriaVinculosDto {
  @ApiProperty({
    description: 'true solo cuando el request trae filtro `estado` (REQ-VMB-07).',
  })
  aplicada!: boolean;
  @ApiProperty({ description: 'Total REAL de vínculos rotos en el rango filtrado.' })
  total!: number;
  @ApiProperty({ type: () => [VinculoRotoDto], description: 'Tope 100 filas.' })
  rotos!: VinculoRotoDto[];
}

export class ListadoMovimientosBancariosResponseDto {
  @ApiProperty({ example: '2026-06-01' }) desde!: string;
  @ApiProperty({ example: '2026-06-30' }) hasta!: string;
  @ApiProperty() page!: number;
  @ApiProperty() limit!: number;
  @ApiProperty({ description: 'Total de movimientos que satisfacen los filtros (REQ-VMB-04).' })
  total!: number;
  @ApiProperty({ type: () => [MovimientoVerificadorDto] })
  movimientos!: MovimientoVerificadorDto[];
  @ApiProperty({ type: () => [TotalMonedaDto] })
  totales!: TotalMonedaDto[];
  @ApiProperty({ type: () => [SaldoCuentaBancariaDto] })
  saldos!: SaldoCuentaBancariaDto[];
  @ApiProperty({ type: () => AuditoriaVinculosDto })
  auditoriaVinculos!: AuditoriaVinculosDto;
}

export function toListadoMovimientosBancariosResponse(
  listado: ListadoMovimientosBancarios,
): ListadoMovimientosBancariosResponseDto {
  return listado;
}
