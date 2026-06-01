import { ApiProperty } from '@nestjs/swagger';

import { EstadoLote } from '../domain/enums';
import { LoteConResumen } from '../dashboard.service';

/**
 * Versión compacta de un lote para el dashboard de granja. Aplana el resumen
 * en un solo objeto plano, optimizado para tarjetas mobile-first.
 */
export class LoteDashboardItemDto {
  @ApiProperty() id!: string;
  @ApiProperty({ nullable: true }) nombre!: string | null;
  @ApiProperty({ nullable: true }) galpon!: string | null;
  @ApiProperty({ enum: EstadoLote }) estado!: EstadoLote;
  @ApiProperty() cantidadInicial!: number;
  @ApiProperty({ example: '2026-06-01' }) fechaIngreso!: string;
  @ApiProperty() edadDias!: number;
  @ApiProperty() avesVivas!: number;
  @ApiProperty({ example: '12500.00' }) costoAcumulado!: string;
  @ApiProperty({ nullable: true, example: '2.51' }) costoPorPolloVivo!: string | null;
  @ApiProperty({ example: 0.004 }) porcentajeMortalidad!: number;
}

export function toLoteDashboardItem(data: LoteConResumen): LoteDashboardItemDto {
  const { lote, resumen, edadDias } = data;
  return {
    id: lote.id,
    nombre: lote.nombre,
    galpon: lote.galpon,
    estado: lote.estado,
    cantidadInicial: lote.cantidadInicial,
    fechaIngreso: lote.fechaIngreso.toISOString().slice(0, 10),
    edadDias,
    avesVivas: resumen.avesVivas,
    costoAcumulado: resumen.costoAcumulado.toBob(),
    costoPorPolloVivo: resumen.costoPorPolloVivo ? resumen.costoPorPolloVivo.toBob() : null,
    porcentajeMortalidad: resumen.porcentajeMortalidad,
  };
}
