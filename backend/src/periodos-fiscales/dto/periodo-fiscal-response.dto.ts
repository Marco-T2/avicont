import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PeriodoFiscal, PeriodoFiscalStatus } from '@prisma/client';

export class PeriodoFiscalResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() gestionId!: string;
  @ApiProperty({ example: 2026 }) year!: number;
  @ApiProperty({ example: 4, description: '1-12 (mes calendario real)' })
  month!: number;
  @ApiProperty({ example: 1, description: '1-12 (posición en la gestión)' })
  ordenEnGestion!: number;
  @ApiProperty({ enum: PeriodoFiscalStatus }) status!: PeriodoFiscalStatus;
  @ApiProperty({
    description: 'Marcado manualmente; un período definitivo no se puede reabrir.',
  })
  esDefinitivo!: boolean;

  @ApiPropertyOptional({ nullable: true, example: '2026-05-03T10:15:00.000Z' })
  closedAt!: string | null;
  @ApiPropertyOptional({ nullable: true })
  closedByUserId!: string | null;

  @ApiProperty({ example: '2026-01-01T00:00:00.000Z' }) createdAt!: string;
  @ApiProperty({ example: '2026-01-01T00:00:00.000Z' }) updatedAt!: string;
}

export function toPeriodoResponse(p: PeriodoFiscal): PeriodoFiscalResponseDto {
  return {
    id: p.id,
    gestionId: p.gestionId,
    year: p.year,
    month: p.month,
    ordenEnGestion: p.ordenEnGestion,
    status: p.status,
    esDefinitivo: p.esDefinitivo,
    closedAt: p.closedAt ? p.closedAt.toISOString() : null,
    closedByUserId: p.closedByUserId,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}
