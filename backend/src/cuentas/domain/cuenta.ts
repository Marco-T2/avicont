// Entidad de dominio Cuenta: espejo del row Prisma con los enums propios del
// dominio. Vive acá porque el dominio NO importa runtime de `@prisma/client`
// (§3.5 CLAUDE.md, política §5.3 de `docs/deudas-arquitecturales.md`).
//
// El adapter `prisma-cuenta.repository.ts` mapea row Prisma ↔ `Cuenta` dominio
// usando los enum mappers de `../adapters/enum-mappers.ts`.
//
// `Moneda` sigue importado desde Prisma de forma transitoria: es enum
// cross-module y se migra en el slice Moneda de PR D (ver
// `docs/deudas-arquitecturales.md §5.3`).

import type { Moneda } from '@prisma/client';

import type { ClaseCuenta } from '@/common/domain/enums';

import type { NaturalezaCuenta, SubClaseCuenta } from './enums';

export interface Cuenta {
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
