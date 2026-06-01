import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsString, IsUUID, Matches, MaxLength } from 'class-validator';

export class CreateMovimientoInversionDto {
  @ApiProperty({
    example: '1250.50',
    description: 'Monto en BOB como string (§4.5 — evita pérdida IEEE-754). > 0.',
    pattern: '^\\d+(\\.\\d{1,2})?$',
  })
  // §4.5: el dinero cruza HTTP como string; el service lo envuelve en Prisma.Decimal.
  @IsString()
  @Matches(/^\d+(\.\d{1,2})?$/, {
    message: 'monto debe ser un número positivo con hasta 2 decimales (ej: "1250.50")',
  })
  monto!: string;

  @ApiProperty({ example: '2026-06-10', description: 'Fecha del movimiento (calendario).' })
  @IsDateString()
  fecha!: string;

  @ApiProperty({ example: 'a1b2c3d4-...', description: 'TipoRegistro de naturaleza INVERSION.' })
  @IsUUID()
  tipoRegistroId!: string;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  detalle?: string;
}
