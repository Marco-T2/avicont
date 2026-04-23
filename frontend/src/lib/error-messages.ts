// Helpers para extraer y traducir errores del backend (ver
// ../CLAUDE.md §6.3 para el catálogo de codes).

export interface BackendErrorPayload {
  code?: string;
  message?: string;
  details?: Record<string, unknown>;
}

export function extractBackendError(err: unknown): BackendErrorPayload {
  if (typeof err !== 'object' || err === null) return {};
  const maybe = err as { response?: { data?: unknown } };
  const data = maybe.response?.data;
  if (typeof data !== 'object' || data === null) return {};
  return data as BackendErrorPayload;
}

export function backendErrorMessage(err: unknown, fallback: string): string {
  const p = extractBackendError(err);
  return p.message ?? fallback;
}

// Extrae el array de conceptos que bloquean desactivación (payload del
// error CUENTA_CONFIGURADA_COMO_CONCEPTO).
export function conceptosBloqueantes(err: unknown): string[] {
  const p = extractBackendError(err);
  const conceptos = p.details?.conceptos;
  return Array.isArray(conceptos)
    ? conceptos.filter((c): c is string => typeof c === 'string')
    : [];
}

// Labels humanizados para los conceptos de OrgConfiguracionContable.
export const CONCEPTO_LABELS: Record<string, string> = {
  ivaCreditoId: 'IVA Crédito Fiscal',
  ivaDebitoId: 'IVA Débito Fiscal',
  ivaCreditoImportacionesId: 'IVA Crédito (importaciones)',
  itPorPagarId: 'IT por pagar',
  iuePorPagarId: 'IUE por pagar',
  rcIvaRetenidoId: 'RC-IVA retenido',
  difCambioGananciaId: 'Diferencia de cambio — ganancia',
  difCambioPerdidaId: 'Diferencia de cambio — pérdida',
  resultadoEjercicioId: 'Resultado del ejercicio',
  resultadosAcumuladosId: 'Resultados acumulados',
  cajaChicaDefaultId: 'Caja chica default',
  ajustePorInflacionId: 'Ajuste por inflación',
};
