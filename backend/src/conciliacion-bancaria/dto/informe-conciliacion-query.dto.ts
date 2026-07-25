import { ApiProperty } from '@nestjs/swagger';
import { IsUUID, Matches } from 'class-validator';

/**
 * Query del informe `GET /api/conciliacion/informe` (REQ-ICB-01). El corte es
 * una fecha de calendario puro (§4.6) — el informe compara saldos ACUMULADOS
 * hasta ella, inclusive.
 */
export class InformeConciliacionQueryDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  cuentaBancariaId!: string;

  @ApiProperty({ example: '2026-07-31', description: 'Fecha de corte, inclusive.' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'corte debe tener formato YYYY-MM-DD' })
  corte!: string;
}
