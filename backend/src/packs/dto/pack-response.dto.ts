import { ApiProperty } from '@nestjs/swagger';
import { TipoPack, VerticalPack } from '@prisma/client';

import type { Pack } from '../domain/pack';

/** Representación HTTP de un pack del catálogo. */
export class PackResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty({ description: 'Clave estable namespaced. Ej: "contabilidad.adjuntos".' })
  clave!: string;
  @ApiProperty() nombre!: string;
  @ApiProperty({ nullable: true, type: String }) descripcion!: string | null;
  @ApiProperty({ enum: VerticalPack }) verticalAplicable!: VerticalPack;
  @ApiProperty({ enum: TipoPack }) tipo!: TipoPack;
  @ApiProperty() activo!: boolean;
}

export function toPackResponse(pack: Pack): PackResponseDto {
  return {
    id: pack.id,
    clave: pack.clave,
    nombre: pack.nombre,
    descripcion: pack.descripcion,
    verticalAplicable: pack.verticalAplicable,
    tipo: pack.tipo,
    activo: pack.activo,
  };
}
