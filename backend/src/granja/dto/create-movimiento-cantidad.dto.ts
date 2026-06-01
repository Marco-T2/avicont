import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsInt, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator';

export class CreateMovimientoCantidadDto {
  @ApiProperty({
    example: 12,
    minimum: 1,
    description: 'Cantidad de aves (mortalidad). Entero > 0.',
  })
  @IsInt()
  @Min(1)
  cantidad!: number;

  @ApiProperty({ example: '2026-06-10', description: 'Fecha del movimiento (calendario).' })
  @IsDateString()
  fecha!: string;

  @ApiProperty({ example: 'a1b2c3d4-...', description: 'TipoRegistro de naturaleza CANTIDAD.' })
  @IsUUID()
  tipoRegistroId!: string;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  detalle?: string;
}
