// Mappers de enums Prisma → dominio para el módulo reportes.
// Convención §5.3 de `docs/deudas-arquitecturales.md`: cuando un adapter
// mapea 2+ enums, los mappers viven en un archivo separado del adapter.
//
// Los valores string son idénticos a los enums Prisma — el mapper es identity
// en runtime; el `Record` solo separa los nominal types. Si Prisma agrega un
// valor al enum, el `Record` falla en compile con "missing property", lo que
// fuerza a actualizar el enum del dominio en el mismo PR.
//
// NO se importa desde `cuentas/adapters/enum-mappers` (§3.3 CLAUDE.md: cross-module
// a un adapter ajeno es smell). `reportes` mapea su propio boundary — la duplicación
// del Record es intencional y aceptada por la convención.

import {
  ClaseCuenta as PrismaClaseCuenta,
  NaturalezaCuenta as PrismaNaturalezaCuenta,
  SubClaseCuenta as PrismaSubClaseCuenta,
} from '@prisma/client';

import { ClaseCuenta, NaturalezaCuenta, SubClaseCuenta } from '@/common/domain/enums';

// ------------------------------------------------------------
// ClaseCuenta
// ------------------------------------------------------------

const CLASE_PRISMA_A_DOMINIO: Record<PrismaClaseCuenta, ClaseCuenta> = {
  ACTIVO: ClaseCuenta.ACTIVO,
  PASIVO: ClaseCuenta.PASIVO,
  PATRIMONIO: ClaseCuenta.PATRIMONIO,
  INGRESO: ClaseCuenta.INGRESO,
  EGRESO: ClaseCuenta.EGRESO,
};

export function toDominioClaseCuenta(p: PrismaClaseCuenta): ClaseCuenta {
  return CLASE_PRISMA_A_DOMINIO[p];
}

// ------------------------------------------------------------
// NaturalezaCuenta
// ------------------------------------------------------------

const NATURALEZA_PRISMA_A_DOMINIO: Record<PrismaNaturalezaCuenta, NaturalezaCuenta> = {
  DEUDORA: NaturalezaCuenta.DEUDORA,
  ACREEDORA: NaturalezaCuenta.ACREEDORA,
};

export function toDominioNaturalezaCuenta(p: PrismaNaturalezaCuenta): NaturalezaCuenta {
  return NATURALEZA_PRISMA_A_DOMINIO[p];
}

// ------------------------------------------------------------
// SubClaseCuenta
// ------------------------------------------------------------

const SUBCLASE_PRISMA_A_DOMINIO: Record<PrismaSubClaseCuenta, SubClaseCuenta> = {
  ACTIVO_CORRIENTE: SubClaseCuenta.ACTIVO_CORRIENTE,
  ACTIVO_NO_CORRIENTE: SubClaseCuenta.ACTIVO_NO_CORRIENTE,
  PASIVO_CORRIENTE: SubClaseCuenta.PASIVO_CORRIENTE,
  PASIVO_NO_CORRIENTE: SubClaseCuenta.PASIVO_NO_CORRIENTE,
  PATRIMONIO_CAPITAL: SubClaseCuenta.PATRIMONIO_CAPITAL,
  PATRIMONIO_RESULTADOS: SubClaseCuenta.PATRIMONIO_RESULTADOS,
  INGRESO_OPERATIVO: SubClaseCuenta.INGRESO_OPERATIVO,
  INGRESO_NO_OPERATIVO: SubClaseCuenta.INGRESO_NO_OPERATIVO,
  EGRESO_OPERATIVO: SubClaseCuenta.EGRESO_OPERATIVO,
  EGRESO_ADMINISTRATIVO: SubClaseCuenta.EGRESO_ADMINISTRATIVO,
  EGRESO_COMERCIALIZACION: SubClaseCuenta.EGRESO_COMERCIALIZACION,
  EGRESO_FINANCIERO: SubClaseCuenta.EGRESO_FINANCIERO,
  EGRESO_NO_OPERATIVO: SubClaseCuenta.EGRESO_NO_OPERATIVO,
};

export function toDominioSubClaseCuenta(p: PrismaSubClaseCuenta): SubClaseCuenta {
  return SUBCLASE_PRISMA_A_DOMINIO[p];
}
