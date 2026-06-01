import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsString, MaxLength, MinLength } from 'class-validator';

import { NaturalezaRegistro } from '../domain/enums';

export class CreateTipoRegistroDto {
  @ApiProperty({ example: 'Vacunas', minLength: 1, maxLength: 100 })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  nombre!: string;

  @ApiProperty({
    enum: NaturalezaRegistro,
    example: NaturalezaRegistro.INVERSION,
    description: 'INVERSION (costo) o CANTIDAD (mortalidad). Inmutable tras crear.',
  })
  @IsEnum(NaturalezaRegistro)
  naturaleza!: NaturalezaRegistro;
}
