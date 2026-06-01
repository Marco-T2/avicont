import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/**
 * PATCH sobre un tipo de registro. `naturaleza` NO se declara: es inmutable
 * (validarEdicionTipoRegistro la rechaza si llega). Para tipos de sistema, el
 * service rechaza también el cambio de `nombre`.
 */
export class UpdateTipoRegistroDto {
  @ApiPropertyOptional({ minLength: 1, maxLength: 100 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  nombre?: string;

  @ApiPropertyOptional({ description: 'Activar/desactivar el tipo (soft-disable).' })
  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}
