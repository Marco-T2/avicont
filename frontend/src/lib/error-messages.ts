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

// Extrae el id del contacto existente que bloquea la creación por duplicado
// de documento (payload del error CONTACTO_DOCUMENTO_DUPLICADO).
// Útil para que el caller pueda ofrecer "ver contacto existente".
export function contactoExistenteId(err: unknown): string | null {
  const p = extractBackendError(err);
  const id = p.details?.contactoExistenteId;
  return typeof id === 'string' ? id : null;
}

// ============================================================
// Periodos fiscales — mapping específico de los 7 códigos del módulo.
// ============================================================

const MES_NOMBRE: Record<number, string> = {
  1: 'Enero',
  2: 'Febrero',
  3: 'Marzo',
  4: 'Abril',
  5: 'Mayo',
  6: 'Junio',
  7: 'Julio',
  8: 'Agosto',
  9: 'Septiembre',
  10: 'Octubre',
  11: 'Noviembre',
  12: 'Diciembre',
};

const FALLBACK_GENERICO = 'No se pudo completar la operación. Intentá de nuevo.';

function formatearPeriodos(details: Record<string, unknown> | undefined): string | null {
  const raw = details?.periodosAbiertos;
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const nombres: string[] = [];
  for (const p of raw) {
    if (typeof p !== 'object' || p === null) continue;
    const obj = p as { year?: unknown; month?: unknown };
    if (typeof obj.year === 'number' && typeof obj.month === 'number') {
      const nombre = MES_NOMBRE[obj.month];
      if (nombre !== undefined) nombres.push(`${nombre} ${obj.year}`);
    }
  }
  return nombres.length > 0 ? nombres.join(', ') : null;
}

export function mensajePeriodosFiscales(err: unknown): string {
  const p = extractBackendError(err);
  switch (p.code) {
    case 'GESTION_DUPLICADA': {
      const year = p.details?.year;
      return typeof year === 'number'
        ? `Ya existe una gestión para el año ${year}.`
        : 'Ya existe una gestión para ese año.';
    }
    case 'GESTION_YEAR_FUERA_DE_RANGO': {
      const minYear = p.details?.minYear;
      const maxYear = p.details?.maxYear;
      if (typeof minYear === 'number' && typeof maxYear === 'number') {
        return `El año debe estar entre ${minYear} y ${maxYear}.`;
      }
      return 'El año debe estar entre 2000 y el año fiscal siguiente.';
    }
    case 'GESTION_CON_PERIODOS_ABIERTOS': {
      const lista = formatearPeriodos(p.details);
      return lista !== null
        ? `Faltan cerrar: ${lista}.`
        : 'Hay períodos abiertos. Cerralos antes de cerrar la gestión.';
    }
    case 'PERIODO_CERRADO':
      return 'El período ya está cerrado.';
    case 'PERIODO_YA_ABIERTO':
      return 'El período ya está abierto.';
    case 'PERIODO_DEFINITIVO_NO_REABRIBLE':
      return 'Este período fue marcado definitivo y no puede reabrirse.';
    case 'MOTIVO_REAPERTURA_INVALIDO':
      return 'El motivo debe tener al menos 20 caracteres.';
    case 'PERIODO_CON_BORRADORES':
      return 'Hay comprobantes en borrador. Contabilizalos o eliminalos antes de cerrar.';
    default:
      return p.message ?? FALLBACK_GENERICO;
  }
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
