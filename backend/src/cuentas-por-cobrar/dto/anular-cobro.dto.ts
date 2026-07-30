import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';

export class AnularCobroDto {
  // §4.7: motivo ≥ 10 caracteres significativos. El writer re-valida los
  // caracteres SIGNIFICATIVOS; el DTO corta lo obviamente inválido en el borde.
  @ApiProperty({
    example: 'Cobro registrado dos veces por error',
    description: 'Motivo de la anulación, mínimo 10 caracteres (visible en auditoría).',
    minLength: 10,
    maxLength: 500,
  })
  @IsString()
  @Length(10, 500)
  motivo!: string;
}
