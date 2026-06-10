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

// ============================================================
// Comprobantes — mapping de los 31 códigos in-scope del slice 1.
// Los 4 códigos de documentos físicos (slice 2) caen al fallback genérico.
// ============================================================

function extraerOrden(details: Record<string, unknown> | undefined): number | null {
  const v = details?.orden;
  return typeof v === 'number' ? v : null;
}

function conOrden(base: string, details: Record<string, unknown> | undefined): string {
  const orden = extraerOrden(details);
  return orden !== null ? `La línea ${orden}: ${base}` : base;
}

export function mensajeComprobantes(err: unknown): string {
  const p = extractBackendError(err);
  switch (p.code) {
    // 404 — recursos no encontrados
    case 'COMPROBANTE_NO_ENCONTRADO':
      return 'El comprobante no existe o pertenece a otra organización.';
    case 'COMPROBANTE_CUENTA_NO_ENCONTRADA':
      return 'Una de las cuentas referenciadas no existe en esta organización.';

    // 409 — estado incompatible
    case 'COMPROBANTE_ESTADO_INVALIDO':
    case 'COMPROBANTE_NO_EDITABLE_ESTADO_INVALIDO':
      return 'Esta operación no es válida para el estado actual del comprobante.';
    case 'COMPROBANTE_BLOQUEADO':
      return 'El comprobante está bloqueado. Reabrí el período primero.';
    case 'COMPROBANTE_ANULAR_YA_ANULADO':
      return 'Este comprobante ya fue anulado anteriormente.';
    case 'COMPROBANTE_ANULAR_BORRADOR_NO_PERMITIDO':
      return 'No se puede anular un borrador. Eliminalo directamente si ya no lo necesitás.';
    case 'COMPROBANTE_ANULAR_PERIODO_CERRADO':
      return 'El período de este comprobante está cerrado. Reabrí el período para anular.';
    case 'COMPROBANTE_ANULADO_NO_EDITABLE':
      return 'El comprobante está anulado y no puede editarse.';
    case 'COMPROBANTE_PERIODO_NO_ABIERTO':
      return 'No hay un período fiscal abierto para la fecha del comprobante. Creá o abrí el período primero.';
    case 'COMPROBANTE_CAMPOS_INMUTABLES':
      return 'Hay campos que no pueden modificarse tras contabilizar (número, tipo, fecha).';
    case 'COMPROBANTE_EDIT_PERIODO_CERRADO':
      return 'El período de este comprobante está cerrado. Reabrí el período para editar.';
    case 'COMPROBANTE_EDIT_PERIODO_DESTINO_CERRADO':
      return 'No se puede mover el comprobante a ese período: está cerrado.';
    case 'COMPROBANTE_EDIT_NUMERO_INMUTABLE':
      return 'El número del comprobante no puede modificarse.';

    // 422 — invariantes de dominio
    case 'COMPROBANTE_ANULAR_MOTIVO_INVALIDO':
      return 'El motivo no puede ser solo espacios en blanco.';
    case 'COMPROBANTE_SIN_LINEAS':
      return 'Se requieren al menos 2 líneas para contabilizar.';
    case 'COMPROBANTE_DESBALANCEADO': {
      const diffBob = p.details?.diffBob;
      return typeof diffBob === 'string'
        ? `Los débitos y créditos no están balanceados (diferencia: Bs ${diffBob}).`
        : 'Los débitos y créditos no están balanceados (tolerancia ±Bs 0.01).';
    }
    case 'COMPROBANTE_MONTO_CERO':
      return 'No se puede contabilizar un comprobante con monto total cero.';
    case 'COMPROBANTE_GLOSA_REQUERIDA':
      return 'La glosa es obligatoria y no puede estar vacía.';
    case 'COMPROBANTE_LINEA_SIN_MONTO':
      return conOrden('no tiene débito ni crédito. Cada línea debe tener exactamente uno.', p.details);
    case 'COMPROBANTE_LINEA_AMBIGUA_DEBITO_CREDITO':
      return conOrden('tiene débito y crédito al mismo tiempo. Una línea es solo DEBE o solo HABER.', p.details);
    case 'COMPROBANTE_MONTO_BOB_INCOHERENTE':
      return conOrden('el monto en bolivianos no coincide con monto × tipo de cambio (tolerancia ±Bs 0.01).', p.details);
    case 'COMPROBANTE_TIPO_CAMBIO_INVALIDO':
      return conOrden('tipo de cambio inválido para la moneda indicada.', p.details);
    case 'COMPROBANTE_FECHA_FUTURA_NO_PERMITIDA':
      return 'La fecha contable no puede ser posterior a hoy.';
    case 'COMPROBANTE_CUENTA_NO_DETALLE':
      return conOrden('la cuenta es una cuenta agrupadora. Solo se pueden usar cuentas de detalle.', p.details);
    case 'COMPROBANTE_CUENTA_INACTIVA':
      return conOrden('la cuenta está inactiva.', p.details);
    case 'COMPROBANTE_CONTACTO_REQUERIDO': {
      const orden = extraerOrden(p.details);
      return orden !== null
        ? `La línea ${orden} requiere un contacto. Asigná uno antes de contabilizar.`
        : 'Esta línea requiere un contacto. Asigná uno antes de contabilizar.';
    }
    case 'COMPROBANTE_CONTACTO_NO_EXISTE':
      return conOrden('el contacto referenciado no existe en esta organización.', p.details);
    case 'COMPROBANTE_CONTACTO_INACTIVO':
      return conOrden('el contacto está inactivo. Reactivalo o usá otro antes de contabilizar.', p.details);
    case 'COMPROBANTE_MONEDA_INCOMPATIBLE_CUENTA':
      return conOrden('la cuenta no permite la moneda seleccionada.', p.details);
    case 'COMPROBANTE_GESTION_NO_ABIERTA':
      return 'No existe una gestión fiscal para la fecha del comprobante. Creá la gestión primero.';

    // 403
    case 'MISSING_PERMISSION_EDIT_POSTED':
      return 'No tenés permiso para editar comprobantes contabilizados.';
    case 'SIN_PERMISO_EDITAR_CONTABILIZADO':
      return 'No tienes permiso para modificar un asiento contabilizado.';

    // 400
    case 'COMPROBANTE_MOTIVO_ANULACION_REQUERIDO':
      return 'El motivo de anulación es obligatorio y debe tener al menos 10 caracteres.';

    // Documentos de respaldo (slice 2, D6)
    case 'TIPO_DOCUMENTO_INCOMPATIBLE_CON_COMPROBANTE':
      return 'Este tipo de documento no es compatible con el tipo de comprobante.';
    case 'DOCUMENTO_FISICO_YA_ASOCIADO_A_OTRO_CONTABILIZADO':
      return 'Este documento ya está asociado a otro asiento contabilizado.';
    case 'COMPROBANTE_DOCUMENTO_ASOCIACION_PERIODO_CERRADO':
      return 'El período fiscal está cerrado. No se puede modificar el asiento.';
    case 'COMPROBANTE_DOCUMENTO_FISICO_NO_EXISTE':
      return 'El documento físico referenciado no existe en esta organización.';

    // Adjuntos de comprobante (pack contabilidad.adjuntos)
    case 'ADJUNTO_NO_ENCONTRADO':
      return 'El adjunto no existe o pertenece a otra organización.';
    case 'ADJUNTO_TOPE_COMPROBANTE':
      return 'Se alcanzó el límite de 10 adjuntos por comprobante.';
    case 'ADJUNTO_MIME_NO_PERMITIDO':
      return 'Tipo de archivo no permitido. Solo se aceptan PDF, Excel, Word, texto e imágenes.';
    case 'ADJUNTO_TAMANO_EXCEDIDO':
      return 'El archivo supera el límite de 25 MB.';
    case 'ADJUNTO_PERIODO_CERRADO':
      return 'El período fiscal está cerrado. No se pueden modificar adjuntos.';
    case 'ADJUNTO_COMPROBANTE_ANULADO':
      return 'El comprobante está anulado. Solo se pueden consultar sus adjuntos.';

    // Fallback: cubre cualquier código desconocido.
    default:
      return p.message ?? FALLBACK_GENERICO;
  }
}

// ============================================================
// Documentos físicos — mapping de los 8 códigos del módulo.
// ============================================================

export function mensajeDocumentosFisicos(err: unknown): string {
  const p = extractBackendError(err);
  switch (p.code) {
    case 'DOCUMENTO_FISICO_NUMERO_DUPLICADO':
      return 'Ya existe un documento con ese número para el tipo seleccionado.';
    case 'DOCUMENTO_FISICO_NUMERO_FORMATO_INVALIDO':
      return 'El número solo puede contener letras mayúsculas, dígitos, puntos, guiones y barras.';
    case 'DOCUMENTO_FISICO_MONTO_REQUERIDO_PARA_TRIBUTARIO':
      return 'El monto y la moneda son obligatorios para documentos tributarios.';
    case 'DOCUMENTO_FISICO_MONTO_NO_PERMITIDO_PARA_NO_TRIBUTARIO':
      return 'Los documentos no tributarios no llevan monto.';
    case 'DOCUMENTO_FISICO_INMUTABLE_POR_COMPROBANTE_CONTABILIZADO':
      return 'El documento no puede modificarse: está en un comprobante contabilizado.';
    case 'DOCUMENTO_FISICO_REFERENCIADO_POR_COMPROBANTE':
      return 'No se puede eliminar: el documento está asociado a uno o más comprobantes.';
    case 'TIPO_DOCUMENTO_FISICO_NO_ENCONTRADO':
      return 'El tipo de documento seleccionado no existe o fue desactivado.';
    case 'CONTACTO_NO_ENCONTRADO':
      return 'El contacto seleccionado no existe en esta organización.';
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
