import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import type {
  DocumentoFisicoConDetalle,
  DocumentoFisicoConRelaciones,
} from '../ports/documento-fisico.repository.port';

// Los read-models (`DocumentoFisicoConRelaciones`, `DocumentoFisicoConDetalle`)
// son la fuente de verdad y viven en el port. La lectura enriquecida se hace
// en el repo → service; el controller solo mapea a estos DTOs (CLAUDE.md §3.5).

// ============================================================
// DTOs de respuesta
// ============================================================

export class TipoDocumentoFisicoEmbebidoDto {
  @ApiProperty() id!: string;
  @ApiProperty() nombre!: string;
  @ApiProperty() codigo!: string;
  @ApiProperty() esTributario!: boolean;
}

export class ContactoEmbebidoDto {
  @ApiProperty() id!: string;
  @ApiProperty() razonSocial!: string;
}

export class ComprobanteAsociadoDto {
  @ApiProperty() id!: string;
  @ApiPropertyOptional({ nullable: true }) numero!: string | null;
  @ApiProperty() estado!: string;
}

export class DocumentoFisicoDto {
  @ApiProperty() id!: string;
  @ApiProperty() numero!: string;
  @ApiProperty() fechaEmision!: string;
  @ApiPropertyOptional({ nullable: true }) monto!: string | null;
  @ApiPropertyOptional({ nullable: true }) moneda!: string | null;
  @ApiPropertyOptional({ nullable: true }) glosa!: string | null;
  @ApiProperty() tipoDocumentoFisico!: TipoDocumentoFisicoEmbebidoDto;
  @ApiPropertyOptional({ nullable: true, type: () => ContactoEmbebidoDto })
  contacto!: ContactoEmbebidoDto | null;
  @ApiProperty() organizationId!: string;
  @ApiProperty() createdAt!: string;
}

export class DocumentoFisicoDetalleDto extends DocumentoFisicoDto {
  @ApiProperty({ type: () => [ComprobanteAsociadoDto] })
  comprobantesAsociados!: ComprobanteAsociadoDto[];
}

// ============================================================
// DocumentoFisicoAsociadoDto — usado por el endpoint de comprobante (task 6.3)
// ============================================================

export class DocumentoFisicoAsociadoDto {
  @ApiProperty() id!: string;
  @ApiProperty() numero!: string;
  @ApiProperty() tipoDocumentoFisico!: Pick<TipoDocumentoFisicoEmbebidoDto, 'id' | 'nombre'>;
  @ApiPropertyOptional({ nullable: true }) monto!: string | null;
  @ApiPropertyOptional({ nullable: true }) moneda!: string | null;
  @ApiProperty() fechaEmision!: string;
}

// ============================================================
// Mappers
// ============================================================

export interface ListarDocumentosFisicosResponseDto {
  items: DocumentoFisicoDto[];
  total: number;
  page: number;
  pageSize: number;
}

export function toDocumentoFisicoDto(doc: DocumentoFisicoConRelaciones): DocumentoFisicoDto {
  return {
    id: doc.id,
    numero: doc.numero,
    fechaEmision: doc.fechaEmision.toISOString().slice(0, 10),
    monto: doc.monto !== null && doc.monto !== undefined ? doc.monto.toString() : null,
    moneda: doc.moneda ?? null,
    glosa: doc.glosa ?? null,
    tipoDocumentoFisico: {
      id: doc.tipoDocumento.id,
      nombre: doc.tipoDocumento.nombre,
      codigo: doc.tipoDocumento.codigo,
      esTributario: doc.tipoDocumento.esTributario,
    },
    contacto:
      doc.contacto !== null && doc.contacto !== undefined
        ? { id: doc.contacto.id, razonSocial: doc.contacto.razonSocial }
        : null,
    organizationId: doc.organizationId,
    createdAt: doc.createdAt.toISOString(),
  };
}

export function toDocumentoFisicoDetalleDto(
  doc: DocumentoFisicoConDetalle,
): DocumentoFisicoDetalleDto {
  return {
    ...toDocumentoFisicoDto(doc),
    comprobantesAsociados: doc.comprobantesAsociados.map((a) => ({
      id: a.comprobanteId,
      numero: a.comprobanteNumero,
      estado: a.comprobanteEstado,
    })),
  };
}

export function toDocumentoFisicoAsociadoDto(
  doc: DocumentoFisicoConRelaciones,
): DocumentoFisicoAsociadoDto {
  return {
    id: doc.id,
    numero: doc.numero,
    tipoDocumentoFisico: {
      id: doc.tipoDocumento.id,
      nombre: doc.tipoDocumento.nombre,
    },
    monto: doc.monto !== null && doc.monto !== undefined ? doc.monto.toString() : null,
    moneda: doc.moneda ?? null,
    fechaEmision: doc.fechaEmision.toISOString().slice(0, 10),
  };
}
