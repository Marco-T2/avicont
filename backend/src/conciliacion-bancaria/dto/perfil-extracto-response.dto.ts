import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PerfilExtracto } from '@prisma/client';

import type { DescriptorPerfilExtracto } from '../ports/extracto-parser.port';

/**
 * `GET /api/cuentas-bancarias/perfiles` (retomado del slice 1, design §4.5):
 * única fuente de verdad para el desplegable de `perfilExtracto`, el
 * instructivo de descarga y el cartel de advertencia — todo sale de
 * `descriptor`, cero duplicación de verdad.
 *
 * v1 parcial (slice 3): solo expone los perfiles con adapter YA registrado
 * (`BANCOSOL_XLSX`, `ECONOMICO_XLSX`). `UNION_XLSX` se suma en el slice 4.
 */
export class PerfilExtractoResponseDto {
  @ApiProperty({ enum: PerfilExtracto }) perfil!: PerfilExtracto;
  @ApiProperty() banco!: string;
  @ApiProperty() formato!: string;
  @ApiProperty({ type: [String] }) extensiones!: string[];
  @ApiProperty({ type: [String] }) mimeTypes!: string[];
  @ApiProperty() estrategiaChecksum!: string;
  @ApiProperty() soportaContraparte!: boolean;
  @ApiProperty() soportaHora!: boolean;
  @ApiProperty() exponeNumeroCuenta!: boolean;
  @ApiProperty() instruccionesDescarga!: string;
  @ApiPropertyOptional() advertencia?: string;
}

export function toPerfilExtractoResponse(d: DescriptorPerfilExtracto): PerfilExtractoResponseDto {
  return {
    perfil: d.perfil,
    banco: d.banco,
    formato: d.formato,
    extensiones: [...d.extensiones],
    mimeTypes: [...d.mimeTypes],
    estrategiaChecksum: d.estrategiaChecksum,
    soportaContraparte: d.soportaContraparte,
    soportaHora: d.soportaHora,
    exponeNumeroCuenta: d.exponeNumeroCuenta,
    instruccionesDescarga: d.instruccionesDescarga,
    ...(d.advertencia !== undefined ? { advertencia: d.advertencia } : {}),
  };
}
