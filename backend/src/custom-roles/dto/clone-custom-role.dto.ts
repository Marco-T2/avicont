import { IsOptional, IsString, Length, Matches } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// Crea una copia de un CustomRole existente con un slug nuevo.
export class CloneCustomRoleDto {
  @ApiProperty({
    example: 'cobrador-junior',
    description: 'Nuevo slug único dentro de la organización (kebab-case)',
  })
  @IsString()
  @Length(2, 50)
  @Matches(/^[a-z0-9]+(-[a-z0-9]+)*$/, { message: 'slug debe ser kebab-case alfanumérico' })
  slug!: string;

  @ApiPropertyOptional({
    description:
      'Nombre del nuevo rol. Si se omite, se reutiliza el original con sufijo "(copia)".',
  })
  @IsOptional()
  @IsString()
  @Length(2, 80)
  name?: string;
}
