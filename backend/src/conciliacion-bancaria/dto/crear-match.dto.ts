import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { LadoContable, Moneda } from '@prisma/client';
import type { MatchConciliacion } from '@prisma/client';
import { IsIn, IsInt, IsOptional, IsUUID, Min } from 'class-validator';

const CONFIANZAS = ['ALTA', 'MEDIA', 'BAJA'] as const;

/**
 * Confirmación explícita de un par (movimiento bancario ↔ línea contable) —
 * REQ-CB-17. El sistema NUNCA auto-confirma (decisión 2): este DTO es la
 * acción del usuario.
 */
export class CrearMatchDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  movimientoBancarioId!: string;

  @ApiProperty({ format: 'uuid', description: 'Mitad del ancla (design §2.1).' })
  @IsUUID()
  comprobanteId!: string;

  @ApiProperty({ minimum: 1, description: 'Mitad del ancla: posición de la línea (1..N).' })
  @IsInt()
  @Min(1)
  orden!: number;

  @ApiPropertyOptional({
    enum: CONFIANZAS,
    description:
      'Confianza de la sugerencia que el usuario confirmó. Se omite cuando el match es manual.',
  })
  @IsOptional()
  @IsIn(CONFIANZAS)
  confianzaSugerida?: (typeof CONFIANZAS)[number];
}

export class MatchConciliacionResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() movimientoBancarioId!: string;
  @ApiProperty() comprobanteId!: string;
  @ApiProperty() orden!: number;
  @ApiProperty() snapshotCuentaId!: string;
  @ApiProperty({ example: '1500.00' }) snapshotMonto!: string;
  @ApiProperty({ enum: LadoContable }) snapshotTipo!: LadoContable;
  @ApiProperty({ enum: Moneda }) snapshotMoneda!: Moneda;
  @ApiProperty({ example: '2026-06-10' }) snapshotFecha!: string;
  @ApiProperty({ type: String, nullable: true }) confianzaSugerida!: string | null;
  @ApiProperty() conciliadoPorUserId!: string;
  @ApiProperty() createdAt!: string;
}

export function toMatchConciliacionResponse(
  match: MatchConciliacion,
): MatchConciliacionResponseDto {
  return {
    id: match.id,
    movimientoBancarioId: match.movimientoBancarioId,
    comprobanteId: match.comprobanteId,
    orden: match.orden,
    snapshotCuentaId: match.snapshotCuentaId,
    snapshotMonto: match.snapshotMonto.toFixed(2),
    snapshotTipo: match.snapshotTipo,
    snapshotMoneda: match.snapshotMoneda,
    snapshotFecha: match.snapshotFecha.toISOString().slice(0, 10),
    confianzaSugerida: match.confianzaSugerida,
    conciliadoPorUserId: match.conciliadoPorUserId,
    createdAt: match.createdAt.toISOString(),
  };
}
