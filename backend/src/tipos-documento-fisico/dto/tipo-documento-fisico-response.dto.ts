import type { TipoDocumentoFisico } from '@prisma/client';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TipoComprobante } from '@prisma/client';

export class TipoDocumentoFisicoResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() nombre!: string;
  @ApiProperty() codigo!: string;
  @ApiProperty() esTributario!: boolean;
  @ApiProperty() activo!: boolean;
  @ApiProperty({ isArray: true, enum: TipoComprobante })
  tiposComprobanteAplicables!: TipoComprobante[];
  @ApiProperty() organizationId!: string;
  @ApiProperty() createdAt!: string;
  @ApiProperty() updatedAt!: string;
  @ApiProperty({ description: 'Si true, el sistema asigna número correlativo automáticamente.' })
  numeracionAutomatica!: boolean;
  @ApiPropertyOptional({
    nullable: true,
    description: 'Número inicial de la secuencia. Null si numeracionAutomatica=false.',
  })
  numeroInicial!: number | null;
}

export class ListarTiposDocumentoFisicoResponseDto {
  @ApiProperty({ type: () => [TipoDocumentoFisicoResponseDto] })
  items!: TipoDocumentoFisicoResponseDto[];
  @ApiProperty() total!: number;
  @ApiProperty() page!: number;
  @ApiProperty() pageSize!: number;
}

export function toTipoDocumentoFisicoResponse(
  t: TipoDocumentoFisico,
): TipoDocumentoFisicoResponseDto {
  return {
    id: t.id,
    nombre: t.nombre,
    codigo: t.codigo,
    esTributario: t.esTributario,
    activo: t.activo,
    tiposComprobanteAplicables: t.tiposComprobanteAplicables,
    organizationId: t.organizationId,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
    numeracionAutomatica: t.numeracionAutomatica,
    numeroInicial: t.numeroInicial,
  };
}
