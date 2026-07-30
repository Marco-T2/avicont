import { ApiProperty } from '@nestjs/swagger';
import { CondicionPago, EstadoComprobante } from '@prisma/client';

import { FechaContable } from '@/common/domain/fecha-contable';

import type { ComprobanteDeVenta, Venta, VentaConLineas } from '../ports/venta.repository.port';

export class LineaVentaResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 1, description: '1..N dentro de la venta.' })
  orden!: number;

  @ApiProperty({ format: 'uuid' })
  itemId!: string;

  @ApiProperty({ example: 'Pollo entero' })
  descripcion!: string;

  // Decimales como string (§4.5): el cliente los muestra, no los recalcula.
  @ApiProperty({ type: String, example: '5' })
  cantidad!: string;

  @ApiProperty({ type: String, example: '6.305' })
  precioUnitario!: string;

  @ApiProperty({
    format: 'uuid',
    description: 'Snapshot: cuenta resuelta al crear la línea (D-28).',
  })
  cuentaIngresoId!: string;

  @ApiProperty({
    type: String,
    example: '31.53',
    description: 'Calculado por el backend (REQ-VTA-03).',
  })
  subtotal!: string;
}

/**
 * Cabecera de la venta con su estado DERIVADO del comprobante (REQ-VTA-01:
 * la venta no espeja estado; estado/numero/anulado son del comprobante).
 */
export class VentaListItemDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  contactoId!: string;

  @ApiProperty({ example: '2026-07-15', description: 'YYYY-MM-DD, calendario puro (§4.6).' })
  fechaContable!: string;

  @ApiProperty({ enum: CondicionPago })
  condicionPago!: CondicionPago;

  @ApiProperty({ type: String, nullable: true, example: '2026-08-15' })
  fechaVencimiento!: string | null;

  @ApiProperty({ example: 'Venta de pollo faenado' })
  glosa!: string;

  @ApiProperty({
    type: String,
    format: 'uuid',
    nullable: true,
    description: 'Cuenta destino elegida (solo CONTADO, PA-1).',
  })
  cuentaDestinoId!: string | null;

  @ApiProperty({
    type: String,
    example: '31.53',
    description: 'Σ de subtotales redondeados (§4.5).',
  })
  montoTotal!: string;

  @ApiProperty({ format: 'uuid', description: 'Comprobante que da su estado a la venta.' })
  comprobanteId!: string;

  @ApiProperty({ enum: EstadoComprobante })
  estado!: EstadoComprobante;

  @ApiProperty({
    type: String,
    nullable: true,
    example: 'V2607-000001',
    description: 'Número de la serie V, asignado al contabilizar (§4.9). null en borrador.',
  })
  numero!: string | null;

  @ApiProperty({ example: false, description: 'Flag §4.7 — ortogonal al estado.' })
  anulado!: boolean;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: string;
}

export class VentaResponseDto extends VentaListItemDto {
  @ApiProperty({ type: [LineaVentaResponseDto] })
  lineas!: LineaVentaResponseDto[];
}

export class ListarVentasResponseDto {
  @ApiProperty({ type: [VentaListItemDto] })
  ventas!: VentaListItemDto[];

  @ApiProperty({ example: 42 })
  total!: number;

  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 50 })
  pageSize!: number;
}

export class VentaContabilizadaResponseDto {
  @ApiProperty({ format: 'uuid' })
  comprobanteId!: string;

  @ApiProperty({
    example: 'V2607-000001',
    description: 'Número de la serie propia del tipo VENTA.',
  })
  numero!: string;
}

// `@db.Date` llega como Date a medianoche UTC: FechaContable.fromDbDate lee
// con getUTC* y toIso() emite YYYY-MM-DD sin corrimiento de zona (§4.6).
const fechaDbAIso = (fecha: Date): string => FechaContable.fromDbDate(fecha).toIso();

export function toVentaListItem(venta: Venta, comprobante: ComprobanteDeVenta): VentaListItemDto {
  return {
    id: venta.id,
    contactoId: venta.contactoId,
    fechaContable: fechaDbAIso(venta.fechaContable),
    condicionPago: venta.condicionPago,
    fechaVencimiento: venta.fechaVencimiento === null ? null : fechaDbAIso(venta.fechaVencimiento),
    glosa: venta.glosa,
    cuentaDestinoId: venta.cuentaDestinoId,
    // §4.5: el dinero cruza HTTP con sus 2 decimales SIEMPRE. `Decimal.toString()`
    // descarta el cero final ("504.40" → "504.4") y la UI lo pinta crudo, así que
    // un importe redondo se veía con un solo decimal en una columna de dinero.
    // Peor: `estado-cuenta` publica ESA MISMA venta con `toBob()` ⇒ dos endpoints,
    // el mismo número, dos strings distintos. `toFixed(2)` es lo que ya hace
    // `comprobante-response.dto.ts` — acá se alinea la convención.
    montoTotal: venta.montoTotal.toFixed(2),
    comprobanteId: comprobante.id,
    estado: comprobante.estado,
    numero: comprobante.numero,
    anulado: comprobante.anulado,
    createdAt: venta.createdAt.toISOString(),
    updatedAt: venta.updatedAt.toISOString(),
  };
}

export function toVentaResponse(
  venta: VentaConLineas,
  comprobante: ComprobanteDeVenta,
): VentaResponseDto {
  return {
    ...toVentaListItem(venta, comprobante),
    lineas: venta.lineas.map((linea) => ({
      id: linea.id,
      orden: linea.orden,
      itemId: linea.itemId,
      descripcion: linea.descripcion,
      // cantidad y precioUnitario son Decimal(18,6), NO dinero: van con
      // `toString()` a propósito — `toFixed(2)` truncaría "6.305" a "6.31".
      cantidad: linea.cantidad.toString(),
      precioUnitario: linea.precioUnitario.toString(),
      cuentaIngresoId: linea.cuentaIngresoId,
      subtotal: linea.subtotal.toFixed(2), // dinero (§4.5) — ver montoTotal
    })),
  };
}
