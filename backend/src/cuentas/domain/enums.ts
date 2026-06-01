// NaturalezaCuenta y SubClaseCuenta promovidos a `@/common/domain/enums` porque
// el módulo `reportes` también los consume (cross-module). Re-exportados aquí
// para no romper imports intra-módulo durante la transición; los imports internos
// deben migrar a `@/common/domain/enums` progresivamente.
export { NaturalezaCuenta, SubClaseCuenta } from '@/common/domain/enums';
