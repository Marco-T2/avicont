import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CondicionPago } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  ValidateNested,
} from 'class-validator';

import { EsFechaContableIso } from '@/common/validators/es-fecha-contable-iso';

// Los montos y cantidades cruzan HTTP como STRING (§4.5): un float en JSON
// pierde precisión antes de llegar a la columna Decimal(18,6).
const DECIMAL_NO_NEG = /^\d+(\.\d+)?$/;
const DECIMAL_POSITIVE = /^(?!0+(\.0+)?$)\d+(\.\d+)?$/;

/**
 * Línea del documento. SIN `subtotal` a propósito (REQ-VTA-03/B-9): el
 * backend lo deriva de `cantidad × precioUnitario` y el `whitelist: true` del
 * ValidationPipe global elimina cualquier valor que el cliente mande.
 */
export class CreateLineaVentaDto {
  @ApiProperty({ format: 'uuid', description: 'FK viva al catálogo de ítems.' })
  @IsUUID()
  itemId!: string;

  @ApiProperty({
    example: 'Pollo entero',
    minLength: 1,
    maxLength: 500,
    description: 'Snapshot editable por línea: el texto al momento de vender (D-28).',
  })
  @IsString()
  @Length(1, 500)
  descripcion!: string;

  @ApiProperty({
    type: String,
    example: '5',
    description: 'Decimal(18,6) como string, > 0.',
  })
  @Matches(DECIMAL_POSITIVE, { message: 'cantidad debe ser numérica mayor a 0 (ej "5")' })
  cantidad!: string;

  @ApiProperty({
    type: String,
    example: '6.305',
    description:
      'Decimal(18,6) como string, ≥ 0 (un ítem bonificado va con 0: queda en el documento sin emitir línea contable). Precio PACTADO, no el sugerido vigente (D-28).',
  })
  @Matches(DECIMAL_NO_NEG, {
    message: 'precioUnitario debe ser numérico no negativo (ej "6.305")',
  })
  precioUnitario!: string;
}

/**
 * Alta del borrador de venta (REQ-VTA-02). SIN `montoTotal` a propósito: el
 * backend calcula la Σ de subtotales ya redondeados (REQ-VTA-03) — el cliente
 * no dicta los totales.
 */
export class CreateVentaDto {
  @ApiProperty({ format: 'uuid', description: 'Cliente de la venta.' })
  @IsUUID()
  contactoId!: string;

  @ApiProperty({
    example: '2026-07-15',
    description: 'Fecha contable de calendario, YYYY-MM-DD sin hora ni zona (§4.6).',
  })
  @EsFechaContableIso()
  fechaContable!: string;

  @ApiProperty({ enum: CondicionPago, example: CondicionPago.CONTADO })
  @IsEnum(CondicionPago)
  condicionPago!: CondicionPago;

  @ApiPropertyOptional({
    example: '2026-08-15',
    description:
      'Obligatoria en CREDITO, prohibida en CONTADO (REQ-VTA-02) — esa regla cruzada la valida el service con VENTA_VENCIMIENTO_REQUERIDO.',
  })
  @IsOptional()
  @EsFechaContableIso()
  fechaVencimiento?: string;

  @ApiProperty({ example: 'Venta de pollo faenado', minLength: 1, maxLength: 500 })
  @IsString()
  @Length(1, 500)
  glosa!: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'Cuenta destino ELEGIDA de la venta CONTADO (PA-1), validada como efectivo/equivalente. En CREDITO se ignora: la contrapartida es CxC.',
  })
  @IsOptional()
  @IsUUID()
  cuentaDestinoId?: string;

  @ApiProperty({ type: [CreateLineaVentaDto], minItems: 1 })
  @IsArray()
  @ArrayMinSize(1, { message: 'La venta necesita al menos una línea' })
  @ValidateNested({ each: true })
  @Type(() => CreateLineaVentaDto)
  lineas!: CreateLineaVentaDto[];
}
