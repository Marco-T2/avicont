import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { ImportacionExtracto } from '@prisma/client';
import { EstadoVerificacionExtracto, PerfilExtracto } from '@prisma/client';

import type { AdvertenciaImportacion, ResultadoImportacion } from '../extracto-importador.service';

export class AdvertenciaImportacionDto {
  @ApiProperty() codigo!: string;
  @ApiProperty() mensaje!: string;
}

/**
 * Respuesta ÚNICA del `POST /:id/importaciones` — aplana el resultado
 * discriminado del service (`requiereConfirmacionCuenta: true|false`, design
 * §10) en un solo DTO con campos opcionales, para no forzar `oneOf` en
 * Swagger. `requiereConfirmacionCuenta` es el discriminador que el cliente
 * chequea primero.
 */
export class ImportarExtractoResponseDto {
  @ApiProperty() requiereConfirmacionCuenta!: boolean;

  @ApiPropertyOptional({ description: 'Solo si requiereConfirmacionCuenta=true (REQ-CB-16).' })
  numeroDetectado?: string;

  @ApiPropertyOptional() importacionId?: string;
  @ApiPropertyOptional() movimientosNuevos?: number;
  @ApiPropertyOptional() movimientosDuplicados?: number;
  @ApiPropertyOptional() filasLeidas?: number;
  @ApiPropertyOptional({ enum: EstadoVerificacionExtracto })
  estadoVerificacion?: EstadoVerificacionExtracto;
  @ApiPropertyOptional({ type: String, nullable: true }) diferencia?: string | null;
  @ApiPropertyOptional({ type: () => [AdvertenciaImportacionDto] })
  advertencias?: AdvertenciaImportacionDto[];
}

export function toImportarExtractoResponse(
  resultado: ResultadoImportacion,
): ImportarExtractoResponseDto {
  if (resultado.requiereConfirmacionCuenta) {
    return {
      requiereConfirmacionCuenta: true,
      numeroDetectado: resultado.numeroDetectado,
    };
  }
  return {
    requiereConfirmacionCuenta: false,
    importacionId: resultado.importacionId,
    movimientosNuevos: resultado.movimientosNuevos,
    movimientosDuplicados: resultado.movimientosDuplicados,
    filasLeidas: resultado.filasLeidas,
    estadoVerificacion: resultado.estadoVerificacion as EstadoVerificacionExtracto,
    diferencia: resultado.diferencia,
    advertencias: resultado.advertencias as AdvertenciaImportacion[],
  };
}

export class ImportacionExtractoListItemDto {
  @ApiProperty() id!: string;
  @ApiProperty() nombreArchivo!: string;
  @ApiProperty() sha256Archivo!: string;
  @ApiProperty() tamanioBytes!: number;
  @ApiProperty({ enum: PerfilExtracto }) perfilExtracto!: PerfilExtracto;
  @ApiProperty() fechaDesde!: string;
  @ApiProperty() fechaHasta!: string;
  @ApiProperty() coberturaDeclarada!: boolean;
  @ApiProperty({ type: String, nullable: true }) saldoInicial!: string | null;
  @ApiProperty({ type: String, nullable: true }) saldoFinal!: string | null;
  @ApiProperty({ enum: EstadoVerificacionExtracto })
  estadoVerificacion!: EstadoVerificacionExtracto;
  @ApiProperty({ type: String, nullable: true }) diferencia!: string | null;
  @ApiProperty() filasLeidas!: number;
  @ApiProperty() movimientosNuevos!: number;
  @ApiProperty() movimientosDuplicados!: number;
  @ApiProperty() importadoPorUserId!: string;
  @ApiProperty() createdAt!: string;
}

export class ListarImportacionesResponseDto {
  @ApiProperty({ type: () => [ImportacionExtractoListItemDto] })
  items!: ImportacionExtractoListItemDto[];
  @ApiProperty() total!: number;
  @ApiProperty() page!: number;
  @ApiProperty() pageSize!: number;
}

export function toImportacionExtractoListItem(
  imp: ImportacionExtracto,
): ImportacionExtractoListItemDto {
  return {
    id: imp.id,
    nombreArchivo: imp.nombreArchivo,
    sha256Archivo: imp.sha256Archivo,
    tamanioBytes: imp.tamanioBytes,
    perfilExtracto: imp.perfilExtracto,
    fechaDesde: imp.fechaDesde.toISOString(),
    fechaHasta: imp.fechaHasta.toISOString(),
    coberturaDeclarada: imp.coberturaDeclarada,
    saldoInicial: imp.saldoInicial?.toFixed(2) ?? null,
    saldoFinal: imp.saldoFinal?.toFixed(2) ?? null,
    estadoVerificacion: imp.estadoVerificacion,
    diferencia: imp.diferencia?.toFixed(2) ?? null,
    filasLeidas: imp.filasLeidas,
    movimientosNuevos: imp.movimientosNuevos,
    movimientosDuplicados: imp.movimientosDuplicados,
    importadoPorUserId: imp.importadoPorUserId,
    createdAt: imp.createdAt.toISOString(),
  };
}
