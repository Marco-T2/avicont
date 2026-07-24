import { ApiProperty } from '@nestjs/swagger';
import { IsUUID, Matches } from 'class-validator';

/**
 * Query del workspace `GET /api/conciliacion` (design §10). Rango OBLIGATORIO:
 * los dos paneles se calculan sobre él y sin acotarlo la lectura crecería sin
 * techo.
 *
 * Fechas como `YYYY-MM-DD` (calendario puro, §4.6) — mismo formato que el
 * resto de los reportes contables, nunca un timestamp con zona.
 */
export class WorkspaceConciliacionQueryDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  cuentaBancariaId!: string;

  @ApiProperty({ example: '2026-06-01', description: 'Inclusive.' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'desde debe tener formato YYYY-MM-DD' })
  desde!: string;

  @ApiProperty({ example: '2026-06-30', description: 'Inclusive.' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'hasta debe tener formato YYYY-MM-DD' })
  hasta!: string;
}
