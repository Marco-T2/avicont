import { ApiProperty } from '@nestjs/swagger';

import { EstadoLote } from '../domain/enums';
import { ResumenLote } from '../domain/resumen-lote';
import { LoteRow } from '../ports/lote.repository.port';

/** Derivados del read-model (costo por pollo vivo, mortalidad, edad). */
export class ResumenLoteDto {
  @ApiProperty({ example: 4980, description: 'cantidadInicial − muertes.' })
  avesVivas!: number;

  @ApiProperty({ example: '12500.00', description: 'Σ inversiones en BOB (string, §4.5).' })
  costoAcumulado!: string;

  @ApiProperty({
    type: String,
    example: '2.51',
    nullable: true,
    description: 'costoAcumulado / avesVivas. null si avesVivas = 0 (mortalidad total).',
  })
  costoPorPolloVivo!: string | null;

  @ApiProperty({ example: 0.004, description: 'muertes / cantidadInicial (0..1).' })
  porcentajeMortalidad!: number;

  @ApiProperty({ example: 31, description: 'Días desde fechaIngreso (calendario La Paz).' })
  edadDias!: number;
}

export class LoteResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty({ type: String, nullable: true }) nombre!: string | null;
  @ApiProperty() cantidadInicial!: number;
  @ApiProperty({ example: '2026-06-01' }) fechaIngreso!: string;
  @ApiProperty({ type: String, nullable: true, example: '2026-07-15' })
  fechaEstimadaSaca!: string | null;
  @ApiProperty({ type: String, nullable: true }) fechaCierre!: string | null;
  @ApiProperty({ type: String, nullable: true }) galpon!: string | null;
  @ApiProperty({ type: String, nullable: true }) detalle!: string | null;
  @ApiProperty({ enum: EstadoLote }) estado!: EstadoLote;
  @ApiProperty() organizationId!: string;
  @ApiProperty({ type: ResumenLoteDto }) resumen!: ResumenLoteDto;
  @ApiProperty() createdAt!: string;
  @ApiProperty() updatedAt!: string;
}

/**
 * Item de la lista de lotes (GET /granja/lotes). Campos base sin `resumen`:
 * la vista con costo-por-pollo es el dashboard (anti-N×2). La lista sirve para
 * navegar lotes (incluidos los CERRADO) sin disparar el read-model por cada uno.
 */
export class LoteListItemDto {
  @ApiProperty() id!: string;
  @ApiProperty({ type: String, nullable: true }) nombre!: string | null;
  @ApiProperty() cantidadInicial!: number;
  @ApiProperty({ example: '2026-06-01' }) fechaIngreso!: string;
  @ApiProperty({ type: String, nullable: true }) fechaCierre!: string | null;
  @ApiProperty({ type: String, nullable: true }) galpon!: string | null;
  @ApiProperty({ enum: EstadoLote }) estado!: EstadoLote;
}

export class ListarLotesResponseDto {
  @ApiProperty({ type: () => [LoteListItemDto] }) items!: LoteListItemDto[];
  @ApiProperty() total!: number;
  @ApiProperty() page!: number;
  @ApiProperty() pageSize!: number;
}

export function toLoteListItem(lote: LoteRow): LoteListItemDto {
  return {
    id: lote.id,
    nombre: lote.nombre,
    cantidadInicial: lote.cantidadInicial,
    fechaIngreso: lote.fechaIngreso.toISOString().slice(0, 10),
    fechaCierre: toDateOnly(lote.fechaCierre),
    galpon: lote.galpon,
    estado: lote.estado,
  };
}

/** @db.Date → YYYY-MM-DD (calendario puro, §4.6). */
function toDateOnly(d: Date | null): string | null {
  return d ? d.toISOString().slice(0, 10) : null;
}

export function toResumenDto(resumen: ResumenLote, edadDias: number): ResumenLoteDto {
  return {
    avesVivas: resumen.avesVivas,
    costoAcumulado: resumen.costoAcumulado.toBob(),
    costoPorPolloVivo: resumen.costoPorPolloVivo ? resumen.costoPorPolloVivo.toBob() : null,
    porcentajeMortalidad: resumen.porcentajeMortalidad,
    edadDias,
  };
}

export function toLoteResponse(
  lote: LoteRow,
  resumen: ResumenLote,
  edadDias: number,
): LoteResponseDto {
  return {
    id: lote.id,
    nombre: lote.nombre,
    cantidadInicial: lote.cantidadInicial,
    fechaIngreso: toDateOnly(lote.fechaIngreso)!,
    fechaEstimadaSaca: toDateOnly(lote.fechaEstimadaSaca),
    fechaCierre: toDateOnly(lote.fechaCierre),
    galpon: lote.galpon,
    detalle: lote.detalle,
    estado: lote.estado,
    organizationId: lote.organizationId,
    resumen: toResumenDto(resumen, edadDias),
    createdAt: lote.createdAt.toISOString(),
    updatedAt: lote.updatedAt.toISOString(),
  };
}
