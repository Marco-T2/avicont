import { ApiProperty } from '@nestjs/swagger';
import { EstadoComprobante } from '@prisma/client';

import { FechaContable } from '@/common/domain/fecha-contable';

import type {
  AplicacionCobroRow,
  AplicacionDeCobro,
  Cobro,
  ComprobanteDeCobro,
} from '../ports/cobro.repository.port';

/** Aplicación vigente vista desde el cobro (REQ-CXC-03). */
export class AplicacionCobroItemDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  ventaId!: string;

  // Decimales como string (§4.5): el cliente los muestra, no los recalcula.
  @ApiProperty({ type: String, example: '300.00' })
  montoAplicado!: string;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;
}

/**
 * Cabecera del cobro con su estado DERIVADO del comprobante (REQ-CXC-02: el
 * cobro no espeja estado; estado/numero/anulado son del comprobante).
 */
export class CobroListItemDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  contactoId!: string;

  @ApiProperty({ example: '2026-07-15', description: 'YYYY-MM-DD, calendario puro (§4.6).' })
  fechaContable!: string;

  @ApiProperty({
    type: String,
    example: '1250.50',
    description: 'Decimal(18,2) como string (§4.5).',
  })
  monto!: string;

  @ApiProperty({ format: 'uuid', description: 'Cuenta destino elegida (D-05).' })
  cuentaDestinoId!: string;

  @ApiProperty({ example: 'Pago parcial de la factura 12' })
  glosa!: string;

  @ApiProperty({ format: 'uuid', description: 'Comprobante INGRESO que da su estado al cobro.' })
  comprobanteId!: string;

  @ApiProperty({ enum: EstadoComprobante })
  estado!: EstadoComprobante;

  @ApiProperty({
    type: String,
    nullable: true,
    example: 'I2607-000001',
    description: 'Número de la serie I, asignado al contabilizar (§4.9, D-11). null en borrador.',
  })
  numero!: string | null;

  @ApiProperty({ example: false, description: 'Flag §4.7 — ortogonal al estado.' })
  anulado!: boolean;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: string;
}

export class CobroResponseDto extends CobroListItemDto {
  @ApiProperty({ type: [AplicacionCobroItemDto] })
  aplicaciones!: AplicacionCobroItemDto[];
}

export class ListarCobrosResponseDto {
  @ApiProperty({ type: [CobroListItemDto] })
  cobros!: CobroListItemDto[];

  @ApiProperty({ example: 42 })
  total!: number;

  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 50 })
  pageSize!: number;
}

export class CobroContabilizadoResponseDto {
  @ApiProperty({ format: 'uuid' })
  comprobanteId!: string;

  @ApiProperty({
    example: 'I2607-000001',
    description: 'Número de la serie I del tipo INGRESO (D-11).',
  })
  numero!: string;
}

export class AplicacionCobroResponseDto extends AplicacionCobroItemDto {
  @ApiProperty({ format: 'uuid' })
  cobroId!: string;
}

// `@db.Date` llega como Date a medianoche UTC: FechaContable.fromDbDate lee
// con getUTC* y toIso() emite YYYY-MM-DD sin corrimiento de zona (§4.6).
const fechaDbAIso = (fecha: Date): string => FechaContable.fromDbDate(fecha).toIso();

export function toCobroListItem(cobro: Cobro, comprobante: ComprobanteDeCobro): CobroListItemDto {
  return {
    id: cobro.id,
    contactoId: cobro.contactoId,
    fechaContable: fechaDbAIso(cobro.fechaContable),
    // §4.5: 2 decimales SIEMPRE. `Decimal.toString()` descarta el cero final
    // ("504.40" → "504.4") y la UI lo pinta crudo. Alineado con
    // `comprobante-response.dto.ts` y con `estado-cuenta-response.dto.ts`.
    monto: cobro.monto.toFixed(2),
    cuentaDestinoId: cobro.cuentaDestinoId,
    glosa: cobro.glosa,
    comprobanteId: comprobante.id,
    estado: comprobante.estado,
    numero: comprobante.numero,
    anulado: comprobante.anulado,
    createdAt: cobro.createdAt.toISOString(),
    updatedAt: cobro.updatedAt.toISOString(),
  };
}

export function toCobroResponse(
  cobro: Cobro,
  comprobante: ComprobanteDeCobro,
  aplicaciones: AplicacionDeCobro[],
): CobroResponseDto {
  return {
    ...toCobroListItem(cobro, comprobante),
    aplicaciones: aplicaciones.map((a) => ({
      id: a.id,
      ventaId: a.ventaId,
      montoAplicado: a.montoAplicado.toFixed(2), // dinero (§4.5) — ver monto
      createdAt: a.createdAt.toISOString(),
    })),
  };
}

export function toAplicacionResponse(row: AplicacionCobroRow): AplicacionCobroResponseDto {
  return {
    id: row.id,
    cobroId: row.cobroId,
    ventaId: row.ventaId,
    montoAplicado: row.montoAplicado.toFixed(2), // dinero (§4.5) — ver monto
    createdAt: row.createdAt.toISOString(),
  };
}
