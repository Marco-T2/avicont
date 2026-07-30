import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';

export class AnularVentaDto {
  // §4.7: motivo ≥ 10 caracteres significativos — la única fricción del flujo
  // (REQ-VTA-05: cero confirmaciones salvo esta). El writer re-valida los
  // caracteres SIGNIFICATIVOS; el DTO corta lo obviamente inválido en el borde.
  @ApiProperty({
    example: 'Venta duplicada por error de carga',
    description: 'Motivo de la anulación, mínimo 10 caracteres (visible en auditoría).',
    minLength: 10,
    maxLength: 500,
  })
  @IsString()
  @Length(10, 500)
  motivo!: string;
}
