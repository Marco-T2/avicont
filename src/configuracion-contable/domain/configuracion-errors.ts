// Códigos de error estables del módulo configuracion-contable.
// Cuando exista GlobalExceptionFilter + DomainError base, migrar.

export const ConfigContableErrorCode = {
  CONCEPTO_INVALIDO: 'CONFIG_CONCEPTO_INVALIDO',
  CUENTA_NO_ENCONTRADA: 'CONFIG_CUENTA_NO_ENCONTRADA',
  CUENTA_INACTIVA: 'CONFIG_CUENTA_INACTIVA',
  CUENTA_NO_DETALLE: 'CONFIG_CUENTA_NO_DETALLE',
  CUENTA_CLASE_INCORRECTA: 'CONFIG_CUENTA_CLASE_INCORRECTA',
  DIF_CAMBIO_MISMA_CUENTA: 'CONFIG_DIF_CAMBIO_MISMA_CUENTA',
} as const;

export type ConfigContableErrorCode =
  (typeof ConfigContableErrorCode)[keyof typeof ConfigContableErrorCode];

export interface ConfigContableErrorPayload {
  code: ConfigContableErrorCode;
  message: string;
  details?: Record<string, unknown>;
}

export function configError(
  code: ConfigContableErrorCode,
  message: string,
  details?: Record<string, unknown>,
): ConfigContableErrorPayload {
  return details !== undefined ? { code, message, details } : { code, message };
}
