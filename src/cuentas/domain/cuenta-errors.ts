// Códigos de error del módulo cuentas. Son IDs ESTABLES que consumen
// frontend y clientes externos — una vez publicados no cambian aunque
// cambie el mensaje humano. Ver CLAUDE.md §6.3.
//
// Cuando exista GlobalExceptionFilter + DomainError base (fase posterior),
// migrar de BadRequestException/ConflictException a DomainError.

export const CuentaErrorCode = {
  CODIGO_PUCT_INVALIDO: 'CUENTA_CODIGO_PUCT_INVALIDO',
  CODIGO_PUCT_NIVEL_INSUFICIENTE: 'CUENTA_CODIGO_PUCT_NIVEL_INSUFICIENTE',
  CODIGO_INTERNO_INVALIDO: 'CUENTA_CODIGO_INTERNO_INVALIDO',
  CODIGO_INTERNO_DUPLICADO: 'CUENTA_CODIGO_INTERNO_DUPLICADO',
  NIVEL_MAXIMO_EXCEDIDO: 'CUENTA_NIVEL_MAXIMO_EXCEDIDO',
  PADRE_INVALIDA: 'CUENTA_PADRE_INVALIDA',
  PADRE_ES_DETALLE: 'CUENTA_PADRE_ES_DETALLE',
  PADRE_INACTIVA: 'CUENTA_PADRE_INACTIVA',
  SUBCLASE_INCONSISTENTE: 'CUENTA_SUBCLASE_INCONSISTENTE',
  CONTRARIA_NATURALEZA_INVALIDA: 'CUENTA_CONTRARIA_NATURALEZA_INVALIDA',
  CON_MOVIMIENTOS: 'CUENTA_CON_MOVIMIENTOS',
  CONFIGURADA_COMO_CONCEPTO: 'CUENTA_CONFIGURADA_COMO_CONCEPTO',
  REQUERIDA_SISTEMA_INMUTABLE: 'CUENTA_REQUERIDA_SISTEMA_INMUTABLE',
  NOT_FOUND: 'CUENTA_NOT_FOUND',
} as const;

export type CuentaErrorCode = (typeof CuentaErrorCode)[keyof typeof CuentaErrorCode];

export interface CuentaErrorPayload {
  code: CuentaErrorCode;
  message: string;
  details?: Record<string, unknown>;
}

export function cuentaError(
  code: CuentaErrorCode,
  message: string,
  details?: Record<string, unknown>,
): CuentaErrorPayload {
  return details !== undefined ? { code, message, details } : { code, message };
}
