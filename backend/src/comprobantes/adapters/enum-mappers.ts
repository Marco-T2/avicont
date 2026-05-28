// Mappers de enums dominio ↔ Prisma para el módulo comprobantes.
// Convención §5.3 de `docs/deudas-arquitecturales.md`.
//
// A diferencia de cuentas, comprobantes NO tiene entidad de dominio: sus ports
// devuelven rows Prisma (`ComprobanteConLineas`, divergencia aceptada §5). Por
// eso el enum Prisma vive en DTOs/ports/service y solo el dominio PURO
// (comprobante-validator, numeracion, numero-comprobante) usa el enum del
// dominio. El service mapea Prisma→dominio justo al cruzar a esas funciones
// puras (construir `LineaParaValidar`, instanciar `NumeroComprobante`).
//
// Los valores string son idénticos; el `Record` separa los nominal types y
// falla en compile si Prisma agrega un valor.

import { Moneda as PrismaMoneda, TipoComprobante as PrismaTipoComprobante } from '@prisma/client';

import { Moneda, TipoComprobante } from '@/common/domain/enums';

// ------------------------------------------------------------
// Moneda
// ------------------------------------------------------------

const MONEDA_PRISMA_A_DOMINIO: Record<PrismaMoneda, Moneda> = {
  BOB: Moneda.BOB,
  USD: Moneda.USD,
};

export function toDominioMoneda(p: PrismaMoneda): Moneda {
  return MONEDA_PRISMA_A_DOMINIO[p];
}

// ------------------------------------------------------------
// TipoComprobante
// ------------------------------------------------------------

const TIPO_PRISMA_A_DOMINIO: Record<PrismaTipoComprobante, TipoComprobante> = {
  APERTURA: TipoComprobante.APERTURA,
  DIARIO: TipoComprobante.DIARIO,
  INGRESO: TipoComprobante.INGRESO,
  EGRESO: TipoComprobante.EGRESO,
  AJUSTE: TipoComprobante.AJUSTE,
  TRASPASO: TipoComprobante.TRASPASO,
  CIERRE: TipoComprobante.CIERRE,
};

export function toDominioTipoComprobante(p: PrismaTipoComprobante): TipoComprobante {
  return TIPO_PRISMA_A_DOMINIO[p];
}
