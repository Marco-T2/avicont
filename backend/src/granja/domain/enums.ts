/**
 * Enums de dominio del módulo Granja.
 * Valores en español — el operador avícola lee estos estados directamente
 * en la UI y en los logs orientados al usuario (CLAUDE.md §1, enums de dominio).
 */

export enum EstadoLote {
  ACTIVO = 'ACTIVO',
  CERRADO = 'CERRADO',
}

/**
 * Naturaleza de un tipo de registro. Determina qué tabla de movimiento
 * acepta ese tipo: INVERSION → movimientos_inversion, CANTIDAD → movimientos_cantidad.
 * Extensible en v2 (ADD VALUE 'VENTA') sin romper el schema actual.
 */
export enum NaturalezaRegistro {
  INVERSION = 'INVERSION',
  CANTIDAD = 'CANTIDAD',
}
