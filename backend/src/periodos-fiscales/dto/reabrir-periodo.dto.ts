import { IsString, MaxLength, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ReabrirPeriodoDto {
  @ApiProperty({
    description:
      'Razón documentada de la reapertura. Queda en el log permanente (PeriodoFiscalReopening). Mínimo 20 caracteres.',
    minLength: 20,
    maxLength: 500,
    example: 'Corrección de asiento mal contabilizado detectado en auditoría interna',
  })
  @IsString()
  @MinLength(20)
  @MaxLength(500)
  motivo!: string;
}
