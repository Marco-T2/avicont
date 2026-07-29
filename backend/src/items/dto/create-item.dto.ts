import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TipoItem } from '@prisma/client';
import { IsEnum, IsOptional, IsString, IsUUID, Length, Matches } from 'class-validator';

// Los montos y cantidades cruzan HTTP como STRING (§4.5): un float en JSON
// pierde precisión antes de llegar a la columna Decimal.
const DECIMAL_NO_NEG = /^\d+(\.\d+)?$/;
const DECIMAL_POSITIVE = /^(?!0+(\.0+)?$)\d+(\.\d+)?$/;

export class CreateItemDto {
  @ApiProperty({ example: 'Pollo entero', minLength: 1, maxLength: 200 })
  @IsString()
  @Length(1, 200)
  nombre!: string;

  @ApiProperty({
    enum: TipoItem,
    example: TipoItem.PRODUCTO,
    description:
      'Responde ¿es físico? y nada más. "¿Le sigo el stock?" será un booleano del pack Inventario, nunca un tercer valor de este enum (D-26).',
  })
  @IsEnum(TipoItem)
  tipo!: TipoItem;

  @ApiPropertyOptional({
    type: String,
    example: 'P-01',
    maxLength: 50,
    nullable: true,
    description:
      'Opcional (D-24). Se normaliza a mayúsculas y sin espacios en los bordes; único por organización sólo cuando existe.',
  })
  @IsOptional()
  @IsString()
  @Length(0, 50)
  codigo?: string | null;

  @ApiPropertyOptional({
    type: String,
    example: 'kg',
    maxLength: 20,
    nullable: true,
    description: 'Texto libre. No hay motor de conversiones (D-25).',
  })
  @IsOptional()
  @IsString()
  @Length(0, 20)
  unidadMedida?: string | null;

  @ApiPropertyOptional({
    type: String,
    example: '6.305000',
    nullable: true,
    description:
      'Decimal(18,6) como string. Es un PRECIO sugerido, no un monto: admite sub-centavo (precio por kg) y el redondeo a moneda ocurre una sola vez, en el subtotal de la línea.',
  })
  @IsOptional()
  @Matches(DECIMAL_NO_NEG, {
    message: 'precioUnitarioSugerido debe ser numérico no negativo (ej "6.305000")',
  })
  precioUnitarioSugerido?: string | null;

  @ApiPropertyOptional({
    type: String,
    example: '12',
    description:
      'Decimal(18,6) como string, > 0. Si se omite, el default del schema es 1. Sirve para negocios que venden en cajas o jaulas (D-25).',
  })
  @IsOptional()
  @Matches(DECIMAL_POSITIVE, { message: 'cantidadPorDefecto debe ser numérico mayor a 0' })
  cantidadPorDefecto?: string;

  @ApiPropertyOptional({
    type: String,
    format: 'uuid',
    nullable: true,
    description:
      'Cuenta de ingreso del ítem. Si se omite, al vender cae al concepto `ventasId` de la configuración contable. Debe ser activa y de detalle.',
  })
  @IsOptional()
  @IsUUID()
  cuentaIngresoId?: string | null;
}
