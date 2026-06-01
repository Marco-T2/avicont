import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsInt, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * PATCH sobre un lote ACTIVO. Todos los campos opcionales.
 *
 * `cantidadInicial` se declara aquí DELIBERADAMENTE: con ValidationPipe
 * whitelist:true, un campo omitido del DTO se descartaría en silencio y nunca
 * llegaría al validator de dominio. Al declararlo, el valor sobrevive el
 * whitelist y LoteService.update lo rechaza con GRANJA_LOTE_CANTIDAD_INICIAL_INMUTABLE
 * (espeja el patrón de `numero` inmutable en UpdateComprobanteDto, CLAUDE.md §4.9).
 *
 * `estado` NO se declara: el cierre solo ocurre vía POST /lotes/:id/cerrar, así
 * que un `estado` en el PATCH se ignora silenciosamente (spec granja-lotes).
 */
export class UpdateLoteDto {
  @ApiPropertyOptional({ maxLength: 120 })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  nombre?: string;

  @ApiPropertyOptional({ maxLength: 120 })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  galpon?: string;

  @ApiPropertyOptional({ example: '2026-06-01' })
  @IsOptional()
  @IsDateString()
  fechaIngreso?: string;

  @ApiPropertyOptional({ example: '2026-07-15' })
  @IsOptional()
  @IsDateString()
  fechaEstimadaSaca?: string;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  detalle?: string;

  @ApiPropertyOptional({
    description: 'INMUTABLE. Enviar este campo provoca el rechazo del PATCH.',
  })
  @IsOptional()
  @IsInt()
  cantidadInicial?: number;
}
