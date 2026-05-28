// Entidad de dominio Cuenta: espejo del row Prisma con los enums propios del
// dominio. Vive acá porque el dominio NO importa runtime de `@prisma/client`
// (§3.5 CLAUDE.md, política §5.3 de `docs/deudas-arquitecturales.md`).
//
// El adapter `prisma-cuenta.repository.ts` mapea row Prisma ↔ `Cuenta` dominio
// usando los enum mappers de `../adapters/enum-mappers.ts`.
//
// `ClaseCuenta` y `Moneda` siguen importados desde Prisma de forma transitoria:
// son enums cross-module y se migran en PR D (ver `docs/deudas-arquitecturales.md
// §5.3` y el plan en memory `deuda-backlog-proximas-sesiones`).

import type { ClaseCuenta, Moneda } from '@prisma/client';

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
