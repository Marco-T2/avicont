import { EstadoComprobante, Moneda, TipoComprobante } from '@prisma/client';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { FechaContable } from '@/common/domain/fecha-contable';

import type {
  ComprobanteConLineas,
  ComprobanteListRow,
} from '../ports/comprobante.repository.port';

export class LineaResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() orden!: number;
  @ApiProperty() cuentaId!: string;
  @ApiPropertyOptional({ nullable: true }) contactoId!: string | null;
  @ApiProperty({ enum: Moneda }) moneda!: Moneda;
  @ApiProperty({ example: '1000.00' }) debito!: string;
  @ApiProperty({ example: '0' }) credito!: string;
  @ApiProperty({ example: '1' }) tipoCambio!: string;
  @ApiProperty({ example: '1000.00' }) debitoBob!: string;
  @ApiProperty({ example: '0' }) creditoBob!: string;
  @ApiPropertyOptional({ nullable: true }) glosaLinea!: string | null;
}

export class ComprobanteResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: TipoComprobante }) tipo!: TipoComprobante;
  @ApiPropertyOptional({ nullable: true, example: 'I2604-000042' })
  numero!: string | null;
  @ApiProperty({ enum: EstadoComprobante }) estado!: EstadoComprobante;
  @ApiProperty({ example: '2026-04-22' }) fechaContable!: string;
  @ApiProperty() periodoFiscalId!: string;
  @ApiProperty() glosa!: string;
  @ApiProperty({ enum: Moneda }) monedaPrincipal!: Moneda;
  @ApiProperty({
    example: '1.00000000',
    description:
      'T/C de presentación (re-expresión del encabezado). Siempre presente; default "1.00000000".',
  })
  tipoCambioReexpresion!: string;
  @ApiProperty({ example: '1000.00' }) totalDebitoBob!: string;
  @ApiProperty({ example: '1000.00' }) totalCreditoBob!: string;

  @ApiProperty({ description: 'true si el comprobante fue anulado (§4.7 CLAUDE.md)' })
  anulado!: boolean;
  @ApiPropertyOptional({ nullable: true }) fechaAnulacion!: string | null;
  @ApiPropertyOptional({ nullable: true }) anuladoPorUserId!: string | null;
  @ApiPropertyOptional({ nullable: true }) motivoAnulacion!: string | null;

  @ApiProperty() createdByUserId!: string;
  @ApiProperty() createdAt!: string;
  @ApiProperty() updatedAt!: string;

  @ApiProperty({ type: [LineaResponseDto] }) lineas!: LineaResponseDto[];
}

// ============================================================
// Listado — proyección liviana por fila (no incluye las líneas).
// ============================================================

export class ContactoResumenDto {
  @ApiProperty() id!: string;
  @ApiProperty({ example: 'Avícola Sur S.R.L.' }) nombre!: string;
}

export class DocumentoRespaldoResumenDto {
  @ApiProperty() id!: string;
  @ApiProperty({ example: 'Factura' }) tipoNombre!: string;
  @ApiProperty({ example: '0042' }) numero!: string;
}

export class ComprobanteListItemDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: TipoComprobante }) tipo!: TipoComprobante;
  @ApiPropertyOptional({ nullable: true, example: 'I2604-000042' })
  numero!: string | null;
  @ApiProperty({ enum: EstadoComprobante }) estado!: EstadoComprobante;
  @ApiProperty({ example: '2026-04-22' }) fechaContable!: string;
  @ApiProperty() periodoFiscalId!: string;
  @ApiProperty() glosa!: string;
  @ApiProperty({ enum: Moneda }) monedaPrincipal!: Moneda;
  @ApiProperty({ example: '1.00000000' }) tipoCambioReexpresion!: string;
  @ApiProperty({ example: '1000.00' }) totalDebitoBob!: string;
  @ApiProperty({ example: '1000.00' }) totalCreditoBob!: string;
  @ApiProperty() anulado!: boolean;
  @ApiPropertyOptional({ nullable: true }) fechaAnulacion!: string | null;
  @ApiPropertyOptional({ nullable: true }) anuladoPorUserId!: string | null;
  @ApiPropertyOptional({ nullable: true }) motivoAnulacion!: string | null;
  @ApiProperty() createdByUserId!: string;
  @ApiProperty() createdAt!: string;
  @ApiProperty() updatedAt!: string;

  /** Contactos DISTINTOS referenciados por las líneas (deduplicados por id). */
  @ApiProperty({ type: [ContactoResumenDto] }) contactos!: ContactoResumenDto[];
  /** Documentos físicos de respaldo asociados al comprobante. */
  @ApiProperty({ type: [DocumentoRespaldoResumenDto] })
  documentosRespaldo!: DocumentoRespaldoResumenDto[];
}

export interface ListarComprobantesResponseDto {
  items: ComprobanteListItemDto[];
  total: number;
  page: number;
  limit: number;
}

export function toComprobanteListItem(c: ComprobanteListRow): ComprobanteListItemDto {
  // Contactos DISTINTOS de las líneas: dedupe por id, ignorando las sin contacto.
  // Un mismo contacto en varias líneas cuenta una sola vez.
  const contactos = [
    ...new Map(
      c.lineas
        .map((l) => l.contacto)
        .filter((co): co is { id: string; razonSocial: string } => co !== null)
        .map((co) => [co.id, { id: co.id, nombre: co.razonSocial }] as const),
    ).values(),
  ];

  // El @@unique([documentoFisicoId, comprobanteId]) ya garantiza unicidad.
  const documentosRespaldo = c.documentosFisicosAsociados.map((a) => ({
    id: a.documentoFisico.id,
    tipoNombre: a.documentoFisico.tipoDocumento.nombre,
    numero: a.documentoFisico.numero,
  }));

  return {
    id: c.id,
    tipo: c.tipo,
    numero: c.numero,
    estado: c.estado,
    fechaContable: FechaContable.fromDbDate(c.fechaContable).toIso(),
    periodoFiscalId: c.periodoFiscalId,
    glosa: c.glosa,
    monedaPrincipal: c.monedaPrincipal,
    tipoCambioReexpresion: c.tipoCambioReexpresion.toString(),
    totalDebitoBob: c.totalDebitoBob.toFixed(2),
    totalCreditoBob: c.totalCreditoBob.toFixed(2),
    anulado: c.anulado,
    fechaAnulacion: c.fechaAnulacion ? c.fechaAnulacion.toISOString() : null,
    anuladoPorUserId: c.anuladoPorUserId,
    motivoAnulacion: c.motivoAnulacion,
    createdByUserId: c.createdByUserId,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
    contactos,
    documentosRespaldo,
  };
}

export function toComprobanteResponse(c: ComprobanteConLineas): ComprobanteResponseDto {
  return {
    id: c.id,
    tipo: c.tipo,
    numero: c.numero,
    estado: c.estado,
    fechaContable: FechaContable.fromDbDate(c.fechaContable).toIso(),
    periodoFiscalId: c.periodoFiscalId,
    glosa: c.glosa,
    monedaPrincipal: c.monedaPrincipal,
    tipoCambioReexpresion: c.tipoCambioReexpresion.toString(),
    totalDebitoBob: c.totalDebitoBob.toFixed(2),
    totalCreditoBob: c.totalCreditoBob.toFixed(2),
    anulado: c.anulado,
    fechaAnulacion: c.fechaAnulacion ? c.fechaAnulacion.toISOString() : null,
    anuladoPorUserId: c.anuladoPorUserId,
    motivoAnulacion: c.motivoAnulacion,
    createdByUserId: c.createdByUserId,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
    lineas: c.lineas.map((l) => ({
      id: l.id,
      orden: l.orden,
      cuentaId: l.cuentaId,
      contactoId: l.contactoId,
      moneda: l.moneda,
      debito: l.debito.toString(),
      credito: l.credito.toString(),
      tipoCambio: l.tipoCambio.toString(),
      debitoBob: l.debitoBob.toString(),
      creditoBob: l.creditoBob.toString(),
      glosaLinea: l.glosaLinea,
    })),
  };
}
