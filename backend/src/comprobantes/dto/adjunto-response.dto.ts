import { ApiProperty } from '@nestjs/swagger';
import type { AdjuntoComprobante } from '@prisma/client';

/**
 * DTO de respuesta para adjuntos de comprobantes.
 *
 * NO expone:
 *   - `storageKey`: clave interna de MinIO — dato de infraestructura, no relevante
 *     para el cliente y podría usarse para acceso directo al bucket.
 *   - `organizationId`: ya implícito por el contexto del request (tenant isolation).
 *   - `sha256`: v1 siempre null — no se envía al cliente hasta que se implemente
 *     la deduplicación.
 *
 * `createdAt` se serializa como ISO string en UTC (CLAUDE.md §4.6).
 */
export class AdjuntoResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  comprobanteId!: string;

  @ApiProperty()
  nombreOriginal!: string;

  @ApiProperty()
  mimeType!: string;

  /** Tamaño en bytes del archivo adjunto. */
  @ApiProperty()
  tamanoBytes!: number;

  @ApiProperty({ format: 'uuid' })
  subidoPorUserId!: string;

  /** ISO 8601 UTC — CLAUDE.md §4.6 */
  @ApiProperty()
  createdAt!: string;

  /** ISO 8601 UTC — CLAUDE.md §4.6. Actualizado al reemplazar el adjunto. */
  @ApiProperty()
  updatedAt!: string;
}

/**
 * Mapea una fila de AdjuntoComprobante (Prisma) al DTO de respuesta.
 * Omite campos internos (storageKey, organizationId, sha256).
 */
export function toAdjuntoResponseDto(adjunto: AdjuntoComprobante): AdjuntoResponseDto {
  return {
    id: adjunto.id,
    comprobanteId: adjunto.comprobanteId,
    nombreOriginal: adjunto.nombreOriginal,
    mimeType: adjunto.mimeType,
    tamanoBytes: adjunto.tamanoBytes,
    subidoPorUserId: adjunto.subidoPorUserId,
    // CLAUDE.md §4.6: los timestamps de auditoría van en UTC.
    createdAt: adjunto.createdAt.toISOString(),
    updatedAt: adjunto.updatedAt.toISOString(),
  };
}
