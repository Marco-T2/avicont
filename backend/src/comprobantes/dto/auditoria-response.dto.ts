import { AccionAuditoriaComprobante, ComprobanteAuditoria } from '@prisma/client';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AuditoriaEntryDto {
  @ApiProperty() id!: string;
  @ApiProperty() comprobanteId!: string;
  @ApiProperty() userId!: string;
  @ApiProperty({ enum: AccionAuditoriaComprobante })
  accion!: AccionAuditoriaComprobante;
  @ApiProperty({
    description: 'Diff libre del write. Shape depende de la acción (ver service).',
  })
  diff!: unknown;
  @ApiProperty() fueDuranteReapertura!: boolean;
  @ApiPropertyOptional({ nullable: true })
  reaperturaId!: string | null;
  @ApiProperty({ example: '2026-04-22T14:30:00.000Z' })
  timestamp!: string;
}

export function toAuditoriaEntry(row: ComprobanteAuditoria): AuditoriaEntryDto {
  return {
    id: row.id,
    comprobanteId: row.comprobanteId,
    userId: row.userId,
    accion: row.accion,
    diff: row.diff,
    fueDuranteReapertura: row.fueDuranteReapertura,
    reaperturaId: row.reaperturaId,
    timestamp: row.timestamp.toISOString(),
  };
}
