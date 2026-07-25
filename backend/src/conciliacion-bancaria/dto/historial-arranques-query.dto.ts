import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

/**
 * Query del historial de arranques `GET /api/conciliacion/arranques`
 * (REQ-ICB-04, design D8). Sin paginar a propósito: es un registro de actos
 * puntuales y REQ-ICB-04 exige mostrarlo ENTERO — la declaración anterior
 * nunca se oculta.
 */
export class HistorialArranquesQueryDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  cuentaBancariaId!: string;
}
