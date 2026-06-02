import { ApiProperty } from '@nestjs/swagger';

import { ClaseCuenta, Moneda, NaturalezaCuenta, SubClaseCuenta } from '@/common/domain/enums';

import type { Cuenta } from '../domain/cuenta';

export class CuentaResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() organizationId!: string;
  @ApiProperty() codigoInterno!: string;
  @ApiProperty() nombre!: string;
  @ApiProperty({ type: String, nullable: true }) descripcion!: string | null;
  @ApiProperty({ enum: ClaseCuenta }) claseCuenta!: ClaseCuenta;
  @ApiProperty({ enum: SubClaseCuenta, nullable: true })
  subClaseCuenta!: SubClaseCuenta | null;
  @ApiProperty({ enum: NaturalezaCuenta }) naturaleza!: NaturalezaCuenta;
  @ApiProperty({ type: String, nullable: true }) parentId!: string | null;
  @ApiProperty() nivel!: number;
  @ApiProperty() esDetalle!: boolean;
  @ApiProperty() requiereContacto!: boolean;
  @ApiProperty() esContraria!: boolean;
  @ApiProperty() activa!: boolean;
  @ApiProperty({ enum: Moneda }) monedaFuncional!: Moneda;
  @ApiProperty() permiteMultiMoneda!: boolean;
  @ApiProperty() esSystemSeed!: boolean;
  @ApiProperty() esRequeridaSistema!: boolean;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: string;
  @ApiProperty({ type: String, format: 'date-time' }) updatedAt!: string;
}

export class CuentaListResponseDto {
  @ApiProperty({ type: () => [CuentaResponseDto] }) items!: CuentaResponseDto[];
  @ApiProperty() total!: number;
  @ApiProperty() page!: number;
  @ApiProperty() pageSize!: number;
}

// Árbol: la misma cuenta + arreglo anidado de hijas (self-reference recursiva).
export class CuentaTreeNodeDto extends CuentaResponseDto {
  @ApiProperty({ type: () => [CuentaTreeNodeDto] }) hijas!: CuentaTreeNodeDto[];
}

export function toCuentaResponse(c: Cuenta): CuentaResponseDto {
  return {
    id: c.id,
    organizationId: c.organizationId,
    codigoInterno: c.codigoInterno,
    nombre: c.nombre,
    descripcion: c.descripcion,
    claseCuenta: c.claseCuenta,
    subClaseCuenta: c.subClaseCuenta,
    naturaleza: c.naturaleza,
    parentId: c.parentId,
    nivel: c.nivel,
    esDetalle: c.esDetalle,
    requiereContacto: c.requiereContacto,
    esContraria: c.esContraria,
    activa: c.activa,
    monedaFuncional: c.monedaFuncional,
    permiteMultiMoneda: c.permiteMultiMoneda,
    esSystemSeed: c.esSystemSeed,
    esRequeridaSistema: c.esRequeridaSistema,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  };
}
