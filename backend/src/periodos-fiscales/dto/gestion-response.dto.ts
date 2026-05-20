import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { GestionFiscal, GestionFiscalStatus } from '@prisma/client';

import type { GestionConPeriodos } from '../ports/gestion-fiscal.repository.port';

import { PeriodoFiscalResponseDto, toPeriodoResponse } from './periodo-fiscal-response.dto';

export class GestionResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty({ example: 2026 }) year!: number;
  @ApiProperty({
    example: 1,
    description:
      'Mes en que arranca la gestión (1-12). Derivado de tipoEmpresaPrincipal al crear (Ley 843 art. 46).',
  })
  mesInicio!: number;
  @ApiProperty({ enum: GestionFiscalStatus }) status!: GestionFiscalStatus;

  @ApiPropertyOptional({ nullable: true, example: '2027-01-15T10:00:00.000Z' })
  closedAt!: string | null;
  @ApiPropertyOptional({ nullable: true })
  closedByUserId!: string | null;

  @ApiProperty({ example: '2026-01-01T00:00:00.000Z' }) createdAt!: string;
  @ApiProperty({ example: '2026-01-01T00:00:00.000Z' }) updatedAt!: string;
}

export class GestionConPeriodosResponseDto extends GestionResponseDto {
  @ApiProperty({ type: [PeriodoFiscalResponseDto] })
  periodos!: PeriodoFiscalResponseDto[];
}

export function toGestionResponse(g: GestionFiscal): GestionResponseDto {
  return {
    id: g.id,
    year: g.year,
    mesInicio: g.mesInicio,
    status: g.status,
    closedAt: g.closedAt ? g.closedAt.toISOString() : null,
    closedByUserId: g.closedByUserId,
    createdAt: g.createdAt.toISOString(),
    updatedAt: g.updatedAt.toISOString(),
  };
}

export function toGestionConPeriodosResponse(g: GestionConPeriodos): GestionConPeriodosResponseDto {
  return {
    ...toGestionResponse(g),
    periodos: g.periodos.map(toPeriodoResponse),
  };
}
