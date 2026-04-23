import { IsInt, Max, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CrearGestionDto {
  @ApiProperty({
    example: 2026,
    description:
      'Año fiscal de la gestión. Para tipos de empresa con mesInicio≠1, representa el año de inicio de la gestión (ej. 2026 para gestión abril/2026 - marzo/2027 de una INDUSTRIAL).',
    minimum: 2000,
    maximum: 2100,
  })
  @IsInt()
  @Min(2000)
  @Max(2100)
  year!: number;
}
