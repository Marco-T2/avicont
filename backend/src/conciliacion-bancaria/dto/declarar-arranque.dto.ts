import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';

/** Monto §4.5: string decimal con hasta 2 decimales, signo permitido. */
const MONTO_REGEX = /^-?\d+(\.\d{1,2})?$/;

/**
 * Declaración de un punto de arranque conciliado (REQ-ICB-04): los CUATRO
 * datos vienen DECLARADOS por el usuario. En particular `diferenciaResidual`
 * NO se calcula como `saldoExtracto − saldoLibros`: esa resta incluiría las
 * partidas en tránsito abiertas a la fecha del arranque — que se resuelven
 * solas cuando llega la otra pata — y las cobraría dos veces. El usuario
 * declara solo la parte que asume como INEXPLICABLE.
 */
export class DeclararArranqueDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  cuentaBancariaId!: string;

  @ApiProperty({ example: '2026-06-30', description: 'Corte del arranque (§4.6).' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'fecha debe tener formato YYYY-MM-DD' })
  fecha!: string;

  @ApiProperty({ example: '1000.00', description: 'Saldo del extracto a esa fecha (§4.5).' })
  @Matches(MONTO_REGEX, { message: 'saldoExtracto debe ser un decimal con hasta 2 decimales' })
  saldoExtracto!: string;

  @ApiProperty({ example: '990.00', description: 'Saldo según libros a esa fecha (§4.5).' })
  @Matches(MONTO_REGEX, { message: 'saldoLibros debe ser un decimal con hasta 2 decimales' })
  saldoLibros!: string;

  @ApiProperty({
    example: '10.00',
    description:
      'Diferencia ACEPTADA como inexplicable — declarada, jamás calculada. ' +
      'Positiva cuando el extracto queda por encima de los libros.',
  })
  @Matches(MONTO_REGEX, {
    message: 'diferenciaResidual debe ser un decimal con hasta 2 decimales',
  })
  diferenciaResidual!: string;

  @ApiProperty({
    type: [String],
    example: ['LIN:9f3a…:1'],
    description:
      'Referencias de las partidas abiertas que se CONFIRMA arrastrar, obtenidas de ' +
      'GET /conciliacion/arranques/candidatos. Obligatorio aunque vaya vacío: una ' +
      'línea anterior al arranque puede ser un cheque en circulación o el asiento de ' +
      'apertura, y el sistema no puede distinguirlas — decide quien concilia. Se ' +
      'mandan referencias, no importes: los montos salen del dato.',
  })
  @IsArray()
  @ArrayMaxSize(2000)
  @IsString({ each: true })
  referenciasPartidas!: string[];

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  nota?: string;
}
