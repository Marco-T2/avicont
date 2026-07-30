import { ApiProperty } from '@nestjs/swagger';

import { ESTADOS_COMERCIALES_VENTA, type EstadoComercialVenta } from '../domain/cartera';
import type { EstadoCuentaResult } from '../estado-cuenta.service';

/** Partida abierta del estado de cuenta — TODO derivado (REQ-CXC-07, Anti-05). */
export class VentaEstadoCuentaDto {
  @ApiProperty({ format: 'uuid' })
  ventaId!: string;

  @ApiProperty({ example: '2026-07-10', description: 'YYYY-MM-DD, calendario puro (§4.6).' })
  fechaContable!: string;

  @ApiProperty({ type: String, nullable: true, example: '2026-08-10' })
  fechaVencimiento!: string | null;

  // Decimales como string (§4.5): el cliente los muestra, no los recalcula.
  @ApiProperty({ type: String, example: '1000.00' })
  montoTotal!: string;

  @ApiProperty({ type: String, example: '400.00', description: 'Σ aplicado de sus cobros.' })
  cobrado!: string;

  @ApiProperty({ type: String, example: '600.00', description: 'montoTotal − cobrado, derivado.' })
  saldoPendiente!: string;

  @ApiProperty({ enum: ESTADOS_COMERCIALES_VENTA, example: 'PARCIAL' })
  estadoComercial!: EstadoComercialVenta;

  @ApiProperty({ example: true, description: 'fechaVencimiento < hoy (ClockPort) y saldo > 0.' })
  vencida!: boolean;

  @ApiProperty({
    example: 3,
    description: 'Días de calendario desde el vencimiento; 0 si no venció.',
  })
  diasAtraso!: number;
}

export class EstadoCuentaResponseDto {
  @ApiProperty({ format: 'uuid' })
  contactoId!: string;

  @ApiProperty({ example: 'Avícola Sur S.R.L.' })
  razonSocial!: string;

  @ApiProperty({
    example: '2026-07-28',
    description: 'El "hoy" (America/La_Paz) con el que se derivaron vencimiento y atraso.',
  })
  fechaCorte!: string;

  @ApiProperty({
    type: [VentaEstadoCuentaDto],
    description:
      'Ventas de la cartera con saldo > 0 en orden canónico FIFO (REQ-CXC-05): el frontend auto-tilda sobre ESTE orden, no lo recalcula.',
  })
  ventas!: VentaEstadoCuentaDto[];

  @ApiProperty({ type: String, example: '900.00' })
  totalSaldoPendiente!: string;

  @ApiProperty({
    type: String,
    example: '300.00',
    description: 'Σ saldos no aplicados de los cobros del contacto (anticipos).',
  })
  saldoAFavor!: string;
}

export function toEstadoCuentaResponse(result: EstadoCuentaResult): EstadoCuentaResponseDto {
  return {
    contactoId: result.contactoId,
    razonSocial: result.razonSocial,
    fechaCorte: result.fechaCorte,
    ventas: result.ventas.map((v) => ({
      ventaId: v.ventaId,
      fechaContable: v.fechaContable,
      fechaVencimiento: v.fechaVencimiento,
      montoTotal: v.montoTotal.toBob(),
      cobrado: v.cobrado.toBob(),
      saldoPendiente: v.saldoPendiente.toBob(),
      estadoComercial: v.estadoComercial,
      vencida: v.vencida,
      diasAtraso: v.diasAtraso,
    })),
    totalSaldoPendiente: result.totalSaldoPendiente.toBob(),
    saldoAFavor: result.saldoAFavor.toBob(),
  };
}
