import { ApiPropertyOptional } from '@nestjs/swagger';
import { TipoItem } from '@prisma/client';
import { IsEnum, IsOptional, IsString, IsUUID, Length, Matches } from 'class-validator';

const DECIMAL_NO_NEG = /^\d+(\.\d+)?$/;
const DECIMAL_POSITIVE = /^(?!0+(\.0+)?$)\d+(\.\d+)?$/;

/**
 * PATCH: sólo toca los campos presentes. `null` limpia los que lo admiten.
 *
 * `activo` NO está acá a propósito: el toggle vive en los endpoints
 * `/desactivar` y `/reactivar` para que no se cuele por una edición genérica.
 */
export class UpdateItemDto {
  @ApiPropertyOptional({ example: 'Pollo entero', minLength: 1, maxLength: 200 })
  @IsOptional()
  @IsString()
  @Length(1, 200)
  nombre?: string;

  @ApiPropertyOptional({ enum: TipoItem })
  @IsOptional()
  @IsEnum(TipoItem)
  tipo?: TipoItem;

  @ApiPropertyOptional({ type: String, maxLength: 50, nullable: true })
  @IsOptional()
  @IsString()
  @Length(0, 50)
  codigo?: string | null;

  @ApiPropertyOptional({ type: String, maxLength: 20, nullable: true })
  @IsOptional()
  @IsString()
  @Length(0, 20)
  unidadMedida?: string | null;

  @ApiPropertyOptional({ type: String, example: '6.305000', nullable: true })
  @IsOptional()
  @Matches(DECIMAL_NO_NEG, {
    message: 'precioUnitarioSugerido debe ser numérico no negativo (ej "6.305000")',
  })
  precioUnitarioSugerido?: string | null;

  @ApiPropertyOptional({ type: String, example: '12' })
  @IsOptional()
  @Matches(DECIMAL_POSITIVE, { message: 'cantidadPorDefecto debe ser numérico mayor a 0' })
  cantidadPorDefecto?: string;

  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID()
  cuentaIngresoId?: string | null;
}
