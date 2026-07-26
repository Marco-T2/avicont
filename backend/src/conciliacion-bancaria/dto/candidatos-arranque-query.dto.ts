import { ApiProperty } from '@nestjs/swagger';
import { IsUUID, Matches } from 'class-validator';

/** Query de `GET /conciliacion/arranques/candidatos` (REQ-ICB-04). */
export class CandidatosArranqueQueryDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  cuentaBancariaId!: string;

  @ApiProperty({ example: '2026-06-30', description: 'Fecha del arranque a evaluar (§4.6).' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'fecha debe tener formato YYYY-MM-DD' })
  fecha!: string;
}
