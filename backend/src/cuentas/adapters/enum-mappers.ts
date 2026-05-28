// Mappers de enums dominio ↔ Prisma para el módulo cuentas.
// Convención §5.3 de `docs/deudas-arquitecturales.md`: cuando un adapter
// mapea 2+ enums, los mappers viven en un archivo separado del repository.
//
// Los valores string son idénticos a los enums Prisma — el mapper es identity
// en runtime; el `Record` solo separa los nominal types. Si Prisma agrega un
// valor al enum, el `Record` falla en compile con "missing property", lo que
// fuerza a actualizar el enum del dominio en el mismo PR.

import {
  NaturalezaCuenta as PrismaNaturalezaCuenta,
  SubClaseCuenta as PrismaSubClaseCuenta,
} from '@prisma/client';

import { NaturalezaCuenta, SubClaseCuenta } from '../domain/enums';

// ------------------------------------------------------------
// NaturalezaCuenta
// ------------------------------------------------------------

const NATURALEZA_PRISMA_A_DOMINIO: Record<PrismaNaturalezaCuenta, NaturalezaCuenta> = {
  DEUDORA: NaturalezaCuenta.DEUDORA,
  ACREEDORA: NaturalezaCuenta.ACREEDORA,
};

const NATURALEZA_DOMINIO_A_PRISMA: Record<NaturalezaCuenta, PrismaNaturalezaCuenta> = {
  [NaturalezaCuenta.DEUDORA]: PrismaNaturalezaCuenta.DEUDORA,
  [NaturalezaCuenta.ACREEDORA]: PrismaNaturalezaCuenta.ACREEDORA,
};

export function toDominioNaturalezaCuenta(p: PrismaNaturalezaCuenta): NaturalezaCuenta {
  return NATURALEZA_PRISMA_A_DOMINIO[p];
}

export function toPrismaNaturalezaCuenta(d: NaturalezaCuenta): PrismaNaturalezaCuenta {
  return NATURALEZA_DOMINIO_A_PRISMA[d];
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

const SUBCLASE_DOMINIO_A_PRISMA: Record<SubClaseCuenta, PrismaSubClaseCuenta> = {
  [SubClaseCuenta.ACTIVO_CORRIENTE]: PrismaSubClaseCuenta.ACTIVO_CORRIENTE,
  [SubClaseCuenta.ACTIVO_NO_CORRIENTE]: PrismaSubClaseCuenta.ACTIVO_NO_CORRIENTE,
  [SubClaseCuenta.PASIVO_CORRIENTE]: PrismaSubClaseCuenta.PASIVO_CORRIENTE,
  [SubClaseCuenta.PASIVO_NO_CORRIENTE]: PrismaSubClaseCuenta.PASIVO_NO_CORRIENTE,
  [SubClaseCuenta.PATRIMONIO_CAPITAL]: PrismaSubClaseCuenta.PATRIMONIO_CAPITAL,
  [SubClaseCuenta.PATRIMONIO_RESULTADOS]: PrismaSubClaseCuenta.PATRIMONIO_RESULTADOS,
  [SubClaseCuenta.INGRESO_OPERATIVO]: PrismaSubClaseCuenta.INGRESO_OPERATIVO,
  [SubClaseCuenta.INGRESO_NO_OPERATIVO]: PrismaSubClaseCuenta.INGRESO_NO_OPERATIVO,
  [SubClaseCuenta.EGRESO_OPERATIVO]: PrismaSubClaseCuenta.EGRESO_OPERATIVO,
  [SubClaseCuenta.EGRESO_ADMINISTRATIVO]: PrismaSubClaseCuenta.EGRESO_ADMINISTRATIVO,
  [SubClaseCuenta.EGRESO_COMERCIALIZACION]: PrismaSubClaseCuenta.EGRESO_COMERCIALIZACION,
  [SubClaseCuenta.EGRESO_FINANCIERO]: PrismaSubClaseCuenta.EGRESO_FINANCIERO,
  [SubClaseCuenta.EGRESO_NO_OPERATIVO]: PrismaSubClaseCuenta.EGRESO_NO_OPERATIVO,
};

export function toDominioSubClaseCuenta(p: PrismaSubClaseCuenta): SubClaseCuenta {
  return SUBCLASE_PRISMA_A_DOMINIO[p];
}

export function toPrismaSubClaseCuenta(d: SubClaseCuenta): PrismaSubClaseCuenta {
  return SUBCLASE_DOMINIO_A_PRISMA[d];
}
