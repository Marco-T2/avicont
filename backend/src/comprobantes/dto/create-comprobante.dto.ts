import { Moneda, TipoComprobante } from '@prisma/client';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
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

// Decimales cruzan HTTP como string (CLAUDE.md §4.5) — evita pérdida IEEE-754.
// Admite números sin signo, con o sin decimales. Lado cero válido ("0", "0.00").
const DECIMAL_NO_NEG = /^\d+(\.\d+)?$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export class CreateLineaDto {
  @ApiProperty({ example: '3fa85f64-5717-4562-b3fc-2c963f66afa6' })
  @IsUUID()
  cuentaId!: string;

  @ApiPropertyOptional({
    example: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
    description: 'Requerido si cuenta.requiereContacto al contabilizar',
  })
  @IsOptional()
  @IsUUID()
  contactoId?: string;

  @ApiProperty({ enum: Moneda, example: Moneda.BOB })
  @IsEnum(Moneda)
  moneda!: Moneda;

  @ApiProperty({ example: '1000.00', description: 'Monto DEBE en moneda original (string)' })
  @IsString()
  @Matches(DECIMAL_NO_NEG, { message: 'debito debe ser numérico no negativo (ej "1000.00")' })
  debito!: string;

  @ApiProperty({ example: '0', description: 'Monto HABER en moneda original (string)' })
  @IsString()
  @Matches(DECIMAL_NO_NEG, { message: 'credito debe ser numérico no negativo (ej "0" o "500.50")' })
  credito!: string;

  @ApiProperty({ example: '1', description: 'Tipo de cambio a BOB (1 si moneda=BOB)' })
  @IsString()
  @Matches(DECIMAL_NO_NEG, { message: 'tipoCambio debe ser numérico no negativo' })
  tipoCambio!: string;

  @ApiProperty({ example: '1000.00', description: 'Monto DEBE convertido a BOB' })
  @IsString()
  @Matches(DECIMAL_NO_NEG)
  debitoBob!: string;

  @ApiProperty({ example: '0', description: 'Monto HABER convertido a BOB' })
  @IsString()
  @Matches(DECIMAL_NO_NEG)
  creditoBob!: string;

  @ApiPropertyOptional({ description: 'Glosa específica de la línea (opcional)' })
  @IsOptional()
  @IsString()
  @Length(0, 500)
  glosaLinea?: string;
}

export class CreateComprobanteDto {
  @ApiProperty({ enum: TipoComprobante, example: TipoComprobante.DIARIO })
  @IsEnum(TipoComprobante)
  tipo!: TipoComprobante;

  @ApiProperty({ example: '2026-04-22', description: 'Fecha contable en formato ISO YYYY-MM-DD' })
  @IsString()
  @Matches(ISO_DATE, { message: 'fechaContable debe ser YYYY-MM-DD sin hora ni zona' })
  fechaContable!: string;

  @ApiProperty({ example: 'Venta al contado a cliente X' })
  @IsString()
  @Length(1, 500)
  glosa!: string;

  @ApiPropertyOptional({ enum: Moneda, default: Moneda.BOB })
  @IsOptional()
  @IsEnum(Moneda)
  monedaPrincipal?: Moneda;

  @ApiProperty({ type: [CreateLineaDto], minItems: 1 })
  @IsArray()
  @ArrayMinSize(1, { message: 'Se requiere al menos 1 línea para crear un borrador' })
  @ValidateNested({ each: true })
  @Type(() => CreateLineaDto)
  lineas!: CreateLineaDto[];
}
