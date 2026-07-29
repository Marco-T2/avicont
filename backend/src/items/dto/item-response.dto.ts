import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { Item } from '@prisma/client';
import { TipoItem } from '@prisma/client';

export class ItemResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ type: String, nullable: true, example: 'P-01' })
  codigo!: string | null;

  @ApiProperty({ example: 'Pollo entero' })
  nombre!: string;

  @ApiProperty({ enum: TipoItem })
  tipo!: TipoItem;

  @ApiProperty({ type: String, nullable: true, example: 'kg' })
  unidadMedida!: string | null;

  // Decimales como string (§4.5): el cliente los muestra, no los recalcula.
  @ApiProperty({ type: String, nullable: true, example: '6.305000' })
  precioUnitarioSugerido!: string | null;

  @ApiProperty({ type: String, example: '1.000000' })
  cantidadPorDefecto!: string;

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  cuentaIngresoId!: string | null;

  @ApiProperty({ example: true })
  activo!: boolean;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: string;
}

export class ListarItemsResponseDto {
  @ApiProperty({ type: [ItemResponseDto] })
  items!: ItemResponseDto[];

  @ApiProperty({ example: 42 })
  total!: number;

  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 50 })
  pageSize!: number;
}

export class ItemAfectadoDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'Pollo entero' })
  nombre!: string;

  @ApiPropertyOptional({ type: String, nullable: true, example: 'P-01' })
  codigo!: string | null;
}

export function toItemResponse(item: Item): ItemResponseDto {
  return {
    id: item.id,
    codigo: item.codigo,
    nombre: item.nombre,
    tipo: item.tipo,
    unidadMedida: item.unidadMedida,
    precioUnitarioSugerido: item.precioUnitarioSugerido?.toString() ?? null,
    cantidadPorDefecto: item.cantidadPorDefecto.toString(),
    cuentaIngresoId: item.cuentaIngresoId,
    activo: item.activo,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  };
}
