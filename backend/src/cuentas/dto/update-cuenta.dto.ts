import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsOptional, IsString, Length, ValidateIf } from 'class-validator';

import { ActividadFlujo, Moneda } from '@/common/domain/enums';

// UpdateCuentaDto SOLO expone campos mutables. Los campos estructurales
// (codigoInterno, claseCuenta, subClaseCuenta, naturaleza, parentId,
// esDetalle, esContraria) son INMUTABLES post-creación — si el usuario
// necesita cambiarlos, debe desactivar la cuenta y crear una nueva.
// Ver CLAUDE.md §4.1: "no se puede cambiar el tipo de una cuenta con
// movimientos".
export class UpdateCuentaDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 200)
  nombre?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(0, 500)
  descripcion?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  requiereContacto?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  permiteMultiMoneda?: boolean;

  @ApiPropertyOptional({ enum: Moneda })
  @IsOptional()
  @IsEnum(Moneda)
  monedaFuncional?: Moneda;

  // actividadFlujo es nullable: null = "sin clasificar" (volver a heurística automática).
  // El @ValidateIf permite null explícito sin que @IsEnum lo rechace (§D2 design doc).
  @ApiPropertyOptional({ enum: ActividadFlujo, nullable: true })
  @IsOptional()
  @ValidateIf((o: UpdateCuentaDto) => o.actividadFlujo !== null)
  @IsEnum(ActividadFlujo)
  actividadFlujo?: ActividadFlujo | null;
}
