import type { ClaseCuenta, Moneda } from '@prisma/client';

import type { Cuenta } from '../domain/cuenta';
import type { NaturalezaCuenta, SubClaseCuenta } from '../domain/enums';

export interface CuentaResponseDto {
  id: string;
  organizationId: string;
  codigoInterno: string;
  nombre: string;
  descripcion: string | null;
  claseCuenta: ClaseCuenta;
  subClaseCuenta: SubClaseCuenta | null;
  naturaleza: NaturalezaCuenta;
  parentId: string | null;
  nivel: number;
  esDetalle: boolean;
  requiereContacto: boolean;
  esContraria: boolean;
  activa: boolean;
  monedaFuncional: Moneda;
  permiteMultiMoneda: boolean;
  esSystemSeed: boolean;
  esRequeridaSistema: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CuentaListResponseDto {
  items: CuentaResponseDto[];
  total: number;
  page: number;
  pageSize: number;
}

// Árbol: la misma cuenta + arreglo anidado de hijas
export interface CuentaTreeNodeDto extends CuentaResponseDto {
  hijas: CuentaTreeNodeDto[];
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
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  };
}
