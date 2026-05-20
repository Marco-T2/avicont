import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { TipoComprobante } from '@prisma/client';

/**
 * PATCH del tipo de documento físico. Todos los campos opcionales.
 *
 * `codigo` NO va acá — es inmutable post-creación (REQ-T-05, E-T-07).
 * El campo se ancla al seed y a queries cross-módulo; cambiarlo rompería
 * la idempotencia del upsert de provisioning.
 */
export class UpdateTipoDocumentoFisicoDto {
  @ApiPropertyOptional({ minLength: 1, maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  nombre?: string;

  @ApiPropertyOptional({ description: 'true para documentos tributarios (factura, NC, ND).' })
  @IsOptional()
  @IsBoolean()
  esTributario?: boolean;

  @ApiPropertyOptional({ description: 'Activar o desactivar el tipo sin eliminarlo.' })
  @IsOptional()
  @IsBoolean()
  activo?: boolean;

  @ApiPropertyOptional({
    isArray: true,
    enum: TipoComprobante,
    description: 'Reemplaza la lista completa de tipos de comprobante aplicables.',
  })
  @IsOptional()
  @IsArray()
  @IsEnum(TipoComprobante, { each: true })
  tiposComprobanteAplicables?: TipoComprobante[];
}
