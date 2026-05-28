// Enums propios del dominio de cuentas (single-module).
// Convención §5.3 de `docs/deudas-arquitecturales.md`: el dominio NO importa
// runtime de `@prisma/client`. Los valores son string-for-string idénticos a
// los enums Prisma; los adapters mapean en el boundary
// (ver `../adapters/enum-mappers.ts`).

export enum NaturalezaCuenta {
  DEUDORA = 'DEUDORA',
  ACREEDORA = 'ACREEDORA',
}

export enum SubClaseCuenta {
  ACTIVO_CORRIENTE = 'ACTIVO_CORRIENTE',
  ACTIVO_NO_CORRIENTE = 'ACTIVO_NO_CORRIENTE',
  PASIVO_CORRIENTE = 'PASIVO_CORRIENTE',
  PASIVO_NO_CORRIENTE = 'PASIVO_NO_CORRIENTE',
  PATRIMONIO_CAPITAL = 'PATRIMONIO_CAPITAL',
  PATRIMONIO_RESULTADOS = 'PATRIMONIO_RESULTADOS',
  INGRESO_OPERATIVO = 'INGRESO_OPERATIVO',
  INGRESO_NO_OPERATIVO = 'INGRESO_NO_OPERATIVO',
  EGRESO_OPERATIVO = 'EGRESO_OPERATIVO',
  EGRESO_ADMINISTRATIVO = 'EGRESO_ADMINISTRATIVO',
  EGRESO_COMERCIALIZACION = 'EGRESO_COMERCIALIZACION',
  EGRESO_FINANCIERO = 'EGRESO_FINANCIERO',
  EGRESO_NO_OPERATIVO = 'EGRESO_NO_OPERATIVO',
}
