import { ApiProperty } from '@nestjs/swagger';
import { EstadoMovimientoBancario, LadoBancario, Moneda } from '@prisma/client';
import type { MovimientoBancario } from '@prisma/client';
import { IsIn } from 'class-validator';

/**
 * Estados que el usuario puede fijar a mano (REQ-CB-18). `CONCILIADO` NO está
 * en la lista: esa transición es exclusiva de `POST /api/conciliacion/matches`
 * (REQ-CB-17), el único camino que mantiene la invariante
 * `estado === 'CONCILIADO' ⟺ existe MatchConciliacion` (design §2.3).
 */
const ESTADOS_MANUALES = ['IGNORADO', 'PENDIENTE'] as const;

export class ActualizarEstadoMovimientoDto {
  @ApiProperty({
    enum: ESTADOS_MANUALES,
    description:
      'IGNORADO para ignorar, PENDIENTE para des-ignorar. CONCILIADO no se fija a mano (REQ-CB-17).',
  })
  @IsIn(ESTADOS_MANUALES)
  estado!: (typeof ESTADOS_MANUALES)[number];
}

export class MovimientoBancarioResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() cuentaBancariaId!: string;
  @ApiProperty({ example: '2026-06-10' }) fecha!: string;
  @ApiProperty({ type: String, nullable: true }) hora!: string | null;
  @ApiProperty({ example: '1500.00' }) monto!: string;
  @ApiProperty({ enum: LadoBancario }) tipo!: LadoBancario;
  @ApiProperty({ enum: Moneda }) moneda!: Moneda;
  @ApiProperty() descripcion!: string;
  @ApiProperty({ type: String, nullable: true }) referencia!: string | null;
  @ApiProperty({ type: String, nullable: true }) saldo!: string | null;
  @ApiProperty({ enum: EstadoMovimientoBancario }) estado!: EstadoMovimientoBancario;
}

export function toMovimientoBancarioResponse(
  mov: MovimientoBancario,
): MovimientoBancarioResponseDto {
  return {
    id: mov.id,
    cuentaBancariaId: mov.cuentaBancariaId,
    fecha: mov.fecha.toISOString().slice(0, 10),
    hora: mov.hora,
    monto: mov.monto.toFixed(2),
    tipo: mov.tipo,
    moneda: mov.moneda,
    descripcion: mov.descripcion,
    referencia: mov.referencia,
    saldo: mov.saldo?.toFixed(2) ?? null,
    estado: mov.estado,
  };
}
