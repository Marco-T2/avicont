// Enums propios del dominio compartidos cross-module.
// Convención §5.3 de `docs/deudas-arquitecturales.md`: cross-module → `common/domain/enums.ts`.
// Los valores son string-for-string idénticos a los enums Prisma; los adapters
// mapean en el boundary (ver `<modulo>/adapters/enum-mappers.ts`).

// Tipo de empresa según Ley 843 art. 46 (determina mes de cierre fiscal).
// Dueño del dato: módulo `tenants` (campo `Organization.tipoEmpresaPrincipal`).
// Consumido por: `tenants`, `common/domain/cierre-fiscal-por-tipo-empresa`,
// `periodos-fiscales/gestiones-fiscales.service`.
export enum TipoEmpresa {
  COMERCIAL = 'COMERCIAL',
  SERVICIOS = 'SERVICIOS',
  TRANSPORTE = 'TRANSPORTE',
  INDUSTRIAL = 'INDUSTRIAL',
  PETROLERA = 'PETROLERA',
  CONSTRUCCION = 'CONSTRUCCION',
  AGROPECUARIA = 'AGROPECUARIA',
  MINERA = 'MINERA',
}

// Clase contable de la cuenta (5 valores estándar PUCT).
// Dueño del dato: módulo `cuentas` (campo `Cuenta.claseCuenta`).
// Consumido por: `cuentas`, `configuracion-contable` (validación de mapeos).
export enum ClaseCuenta {
  ACTIVO = 'ACTIVO',
  PASIVO = 'PASIVO',
  PATRIMONIO = 'PATRIMONIO',
  INGRESO = 'INGRESO',
  EGRESO = 'EGRESO',
}

// Moneda en la que se expresa un monto. BOB es la moneda funcional (§4.2).
// Cross-module: viaja en `Cuenta.monedaFuncional` (cuentas) y en la validación
// de líneas de comprobante (comprobantes). Los módulos que devuelven rows
// Prisma desde sus ports (comprobantes/documentos-fisicos, divergencia §5)
// mantienen el enum Prisma en esa capa; solo el dominio puro usa este enum.
export enum Moneda {
  BOB = 'BOB',
  USD = 'USD',
}

// Tipo de comprobante contable (prefijo de 1 letra en el correlativo, §4.9).
// Dueño del dato: módulo `comprobantes`. Consumido por el dominio puro de
// numeración (`numeracion`, `numero-comprobante`). DTOs/ports/services de
// comprobantes y documentos-fisicos mantienen el enum Prisma (divergencia §5).
export enum TipoComprobante {
  APERTURA = 'APERTURA',
  DIARIO = 'DIARIO',
  INGRESO = 'INGRESO',
  EGRESO = 'EGRESO',
  AJUSTE = 'AJUSTE',
  TRASPASO = 'TRASPASO',
  CIERRE = 'CIERRE',
}
