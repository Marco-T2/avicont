// NOTE: sdd:comprobantes-anulacion-refactor — AccionAuditoriaComprobante enum and
// ComprobanteAuditoria Prisma model were dropped in migration 2.5. The audit table
// is now `comprobantes_audit` (raw Postgres, not in Prisma schema). This DTO is a
// placeholder until task 7.x (controller) rewrites listarAuditoria() to query the
// raw table. For now the GET /auditoria endpoint is effectively broken in the layer
// below (registrarAuditoria stubs out to no-op in the port's interim impl).
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// Shape of a row from the raw comprobantes_audit table.
export interface ComprobantesAuditRow {
  id: string;
  tabla: string;
  operacion: string;
  comprobante_id: string;
  organization_id: string;
  usuario_id: string | null;
  motivo: string | null;
  durante_reapertura: boolean;
  reapertura_id: string | null;
  datos_antes: unknown;
  datos_despues: unknown;
  ts: Date;
}

export class AuditoriaEntryDto {
  @ApiProperty() id!: string;
  @ApiProperty() tabla!: string;
  @ApiProperty() operacion!: string;
  @ApiProperty() comprobanteId!: string;
  @ApiPropertyOptional({ nullable: true }) usuarioId!: string | null;
  @ApiPropertyOptional({ nullable: true }) motivo!: string | null;
  @ApiProperty() duranteReapertura!: boolean;
  @ApiPropertyOptional({ nullable: true }) reaperturaId!: string | null;
  @ApiPropertyOptional({ nullable: true }) datosAntes!: unknown;
  @ApiPropertyOptional({ nullable: true }) datosDespues!: unknown;
  @ApiProperty({ example: '2026-04-22T14:30:00.000Z' }) ts!: string;
}

export function toAuditoriaEntry(row: ComprobantesAuditRow): AuditoriaEntryDto {
  return {
    id: row.id,
    tabla: row.tabla,
    operacion: row.operacion,
    comprobanteId: row.comprobante_id,
    usuarioId: row.usuario_id,
    motivo: row.motivo,
    duranteReapertura: row.durante_reapertura,
    reaperturaId: row.reapertura_id,
    datosAntes: row.datos_antes,
    datosDespues: row.datos_despues,
    ts: row.ts.toISOString(),
  };
}
