import { ApiProperty } from '@nestjs/swagger';

import { NaturalezaRegistro } from '../domain/enums';
import { TipoRegistroRow } from '../ports/tipo-registro.repository.port';

export class TipoRegistroResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() nombre!: string;
  @ApiProperty({ enum: NaturalezaRegistro }) naturaleza!: NaturalezaRegistro;
  @ApiProperty({ description: 'true para los 12 tipos fábrica sembrados al activar el vertical.' })
  esSistema!: boolean;
  @ApiProperty() activo!: boolean;
  @ApiProperty() organizationId!: string;
  @ApiProperty() createdAt!: string;
  @ApiProperty() updatedAt!: string;
}

export function toTipoRegistroResponse(t: TipoRegistroRow): TipoRegistroResponseDto {
  return {
    id: t.id,
    nombre: t.nombre,
    naturaleza: t.naturaleza,
    esSistema: t.esSistema,
    activo: t.activo,
    organizationId: t.organizationId,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  };
}
