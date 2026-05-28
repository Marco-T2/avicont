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
