// sdd:comprobantes-anulacion-refactor — La tabla comprobantes_audit es raw SQL
// (no modelada por Prisma) y se puebla exclusivamente por triggers Postgres.
// El adapter lee de ella via $queryRaw y devuelve ComprobanteAuditEntry[].
// Este DTO mapea esas entries al shape de respuesta HTTP.
import { ApiProperty } from '@nestjs/swagger';

import type { ComprobanteAuditEntry } from '../ports/comprobante-audit.types';

export class AuditoriaEntryDto {
  @ApiProperty() id!: string;
  @ApiProperty({ description: "Tabla auditada: 'comprobantes' | 'lineas_comprobante'" })
  tableName!: string;
  @ApiProperty({ description: "Operación: 'INSERT' | 'UPDATE' | 'DELETE'" })
  operation!: string;
  @ApiProperty() comprobanteId!: string;
  @ApiProperty({ type: String, nullable: true }) userId!: string | null;
  @ApiProperty({ type: String, nullable: true }) motivo!: string | null;
  @ApiProperty() fueDuranteReapertura!: boolean;
  @ApiProperty({ type: String, nullable: true }) reaperturaId!: string | null;
  @ApiProperty({ nullable: true }) rowOld!: unknown;
  @ApiProperty({ nullable: true }) rowNew!: unknown;
  @ApiProperty({ example: '2026-04-22T14:30:00.000Z' }) ts!: string;
}

export function toAuditoriaEntry(entry: ComprobanteAuditEntry): AuditoriaEntryDto {
  return {
    id: entry.id,
    tableName: entry.tableName,
    operation: entry.operation,
    comprobanteId: entry.comprobanteId,
    userId: entry.userId,
    motivo: entry.motivo,
    fueDuranteReapertura: entry.fueDuranteReapertura,
    reaperturaId: entry.reaperturaId,
    rowOld: entry.rowOld,
    rowNew: entry.rowNew,
    ts: entry.ts,
  };
}
