import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { TipoComprobante } from '@prisma/client';

/**
 * PATCH del tipo de documento físico. Todos los campos opcionales.
 *
 * `codigo` NO va acá — es inmutable post-creación (REQ-T-05, E-T-07).
 * El campo se ancla al seed y a queries cross-módulo; cambiarlo rompería
 * la idempotencia del upsert de provisioning.
 *
 * `numeracionAutomatica` y `numeroInicial` se exponen SOLO para que el
 * service pueda rechazarlos con 422 (set-once invariant, E-TN-08/09/10).
 * No son editables post-creación — cualquier intento retorna
 * TIPO_DOCUMENTO_FISICO_NUMERO_INICIAL_INMUTABLE.
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

  /**
   * Set-once: expuesto SOLO para rechazar con 422. No modifica el valor almacenado.
   * Ver E-TN-08, E-TN-09, E-TN-10 — cualquier presencia lanza NUMERO_INICIAL_INMUTABLE.
   */
  @ApiPropertyOptional({
    description:
      'Set-once — solo se puede definir al crear el tipo. Enviar este campo en un PATCH retorna 422.',
  })
  @IsOptional()
  @IsBoolean()
  numeracionAutomatica?: boolean;

  /**
   * Set-once: expuesto SOLO para rechazar con 422. No modifica el valor almacenado.
   * Ver E-TN-08, E-TN-09 — cualquier presencia lanza NUMERO_INICIAL_INMUTABLE.
   */
  @ApiPropertyOptional({
    description:
      'Set-once — solo se puede definir al crear el tipo. Enviar este campo en un PATCH retorna 422.',
    minimum: 1,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  numeroInicial?: number;
}
