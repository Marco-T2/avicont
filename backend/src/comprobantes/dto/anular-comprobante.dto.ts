import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';

export class AnularComprobanteDto {
  @ApiProperty({
    example: 'Error en la imputación al cliente',
    description: 'Motivo de la anulación, mínimo 10 caracteres (visible en auditoría)',
    minLength: 10,
    maxLength: 500,
  })
  @IsString()
  @Length(10, 500)
  motivo!: string;
}
