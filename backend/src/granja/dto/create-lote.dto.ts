import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class CreateLoteDto {
  @ApiProperty({
    example: 5000,
    minimum: 1,
    description: 'Pollitos BB que ingresaron. Entero > 0. INMUTABLE tras crear.',
  })
  @IsInt()
  @Min(1)
  cantidadInicial!: number;

  @ApiProperty({ example: '2026-06-01', description: 'Fecha de ingreso del lote (calendario).' })
  @IsDateString()
  fechaIngreso!: string;

  @ApiPropertyOptional({ example: 'Lote junio', maxLength: 120 })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  nombre?: string;

  @ApiPropertyOptional({ example: 'Galpón A', maxLength: 120 })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  galpon?: string;

  @ApiPropertyOptional({
    example: '2026-07-15',
    description: 'Fecha estimada de saca (calendario).',
  })
  @IsOptional()
  @IsDateString()
  fechaEstimadaSaca?: string;

  @ApiPropertyOptional({ example: 'Pollos Cobb 500', maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  detalle?: string;
}
