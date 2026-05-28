// Mappers de enums dominio ↔ Prisma para el módulo tenants.
// Convención §5.3 de `docs/deudas-arquitecturales.md`: mappers en el adapter del
// módulo dueño del enum.
//
// `tenants` es dueño de `TipoEmpresa` (vive en `Organization.tipoEmpresaPrincipal`).
// `periodos-fiscales/gestiones-fiscales.service.ts` consume este mapper directamente
// porque ese service ya bypassea `TenantRepositoryPort` (lee `tx.organization`
// dentro de la misma transacción que crea la gestión, para que la lectura del
// `tipoEmpresaPrincipal` quede dentro del mismo snapshot transaccional). Cuando se
// refactorice ese flujo para consumir un `TenantsReaderPort` síncrono, el mapeo
// se internaliza en el port y este re-export desaparece.

import { TipoEmpresa as PrismaTipoEmpresa } from '@prisma/client';

import { TipoEmpresa } from '@/common/domain/enums';

// ------------------------------------------------------------
// TipoEmpresa
// ------------------------------------------------------------

const TIPO_EMPRESA_PRISMA_A_DOMINIO: Record<PrismaTipoEmpresa, TipoEmpresa> = {
  COMERCIAL: TipoEmpresa.COMERCIAL,
  SERVICIOS: TipoEmpresa.SERVICIOS,
  TRANSPORTE: TipoEmpresa.TRANSPORTE,
  INDUSTRIAL: TipoEmpresa.INDUSTRIAL,
  PETROLERA: TipoEmpresa.PETROLERA,
  CONSTRUCCION: TipoEmpresa.CONSTRUCCION,
  AGROPECUARIA: TipoEmpresa.AGROPECUARIA,
  MINERA: TipoEmpresa.MINERA,
};

const TIPO_EMPRESA_DOMINIO_A_PRISMA: Record<TipoEmpresa, PrismaTipoEmpresa> = {
  [TipoEmpresa.COMERCIAL]: PrismaTipoEmpresa.COMERCIAL,
  [TipoEmpresa.SERVICIOS]: PrismaTipoEmpresa.SERVICIOS,
  [TipoEmpresa.TRANSPORTE]: PrismaTipoEmpresa.TRANSPORTE,
  [TipoEmpresa.INDUSTRIAL]: PrismaTipoEmpresa.INDUSTRIAL,
  [TipoEmpresa.PETROLERA]: PrismaTipoEmpresa.PETROLERA,
  [TipoEmpresa.CONSTRUCCION]: PrismaTipoEmpresa.CONSTRUCCION,
  [TipoEmpresa.AGROPECUARIA]: PrismaTipoEmpresa.AGROPECUARIA,
  [TipoEmpresa.MINERA]: PrismaTipoEmpresa.MINERA,
};

export function toDominioTipoEmpresa(p: PrismaTipoEmpresa): TipoEmpresa {
  return TIPO_EMPRESA_PRISMA_A_DOMINIO[p];
}

export function toPrismaTipoEmpresa(d: TipoEmpresa): PrismaTipoEmpresa {
  return TIPO_EMPRESA_DOMINIO_A_PRISMA[d];
}
