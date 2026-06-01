import { ApiProperty } from '@nestjs/swagger';

import { MovimientoCantidadRow, MovimientoInversionRow } from '../ports/movimiento.repository.port';

export class MovimientoInversionResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() loteId!: string;
  @ApiProperty() tipoRegistroId!: string;
  @ApiProperty({ example: '1250.50', description: 'Monto en BOB como string (§4.5).' })
  monto!: string;
  @ApiProperty({ nullable: true }) detalle!: string | null;
  @ApiProperty({ example: '2026-06-10' }) fecha!: string;
  @ApiProperty() createdAt!: string;
}

export class MovimientoCantidadResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() loteId!: string;
  @ApiProperty() tipoRegistroId!: string;
  @ApiProperty({ example: 12 }) cantidad!: number;
  @ApiProperty({ nullable: true }) detalle!: string | null;
  @ApiProperty({ example: '2026-06-10' }) fecha!: string;
  @ApiProperty() createdAt!: string;
}

export function toMovimientoInversionResponse(
  m: MovimientoInversionRow,
): MovimientoInversionResponseDto {
  return {
    id: m.id,
    loteId: m.loteId,
    tipoRegistroId: m.tipoRegistroId,
    monto: m.monto.toFixed(2),
    detalle: m.detalle,
    fecha: m.fecha.toISOString().slice(0, 10),
    createdAt: m.createdAt.toISOString(),
  };
}

export function toMovimientoCantidadResponse(
  m: MovimientoCantidadRow,
): MovimientoCantidadResponseDto {
  return {
    id: m.id,
    loteId: m.loteId,
    tipoRegistroId: m.tipoRegistroId,
    cantidad: m.cantidad,
    detalle: m.detalle,
    fecha: m.fecha.toISOString().slice(0, 10),
    createdAt: m.createdAt.toISOString(),
  };
}
