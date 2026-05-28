/**
 * Errores de dominio del módulo `comprobantes`. Subclases de DomainError
 * que el GlobalExceptionFilter mapea al formato estándar de respuesta
 * (CLAUDE.md §6.4).
 *
 * Los `code` son IDs ESTABLES hacia el cliente — una vez publicados no
 * cambian aunque el message evolucione (CLAUDE.md §6.3).
 *
 * Las reglas de negocio que levantan estos errores viven en:
 *   - comprobante-validator.ts (invariantes estructurales del comprobante)
 *   - comprobantes.service.ts (transiciones de estado, resolución de período,
 *     numeración, anulación)
 */

import {
  ConflictError,
  ForbiddenError,
  InvalidStateError,
  NotFoundError,
  ValidationError,
} from '@/common/errors';

// ============================================================
// 404 — recursos no existentes (o visibles para el tenant actual)
// ============================================================

export class ComprobanteNoEncontradoError extends NotFoundError {
  constructor(id: string) {
    super('COMPROBANTE_NO_ENCONTRADO', 'El comprobante no existe', { id });
  }
}

export class CuentaNoEncontradaError extends NotFoundError {
  constructor(cuentaId: string) {
    super('COMPROBANTE_CUENTA_NO_ENCONTRADA', 'La cuenta referenciada no existe', { cuentaId });
  }
}

/**
 * Se levanta al asociar un documento físico cuyo id no existe en la
 * organización (inexistente o de otro tenant — defense in depth, CLAUDE.md
 * §4.2). Cubre design §4.6 / REQ-A-10 / escenario E-A-07.
 */
export class DocumentoFisicoReferenciadoNoExisteError extends NotFoundError {
  constructor(documentoFisicoId: string) {
    super(
      'COMPROBANTE_DOCUMENTO_FISICO_NO_EXISTE',
      'El documento físico referenciado no existe en la organización',
      { documentoFisicoId },
    );
  }
}

// ============================================================
// 409 — estado del comprobante / período incompatible con la operación
// ============================================================

export class ComprobanteEstadoInvalidoError extends ConflictError {
  constructor(id: string, estado: string, operacion: string) {
    super(
      'COMPROBANTE_ESTADO_INVALIDO',
      `La operación "${operacion}" no es válida para un comprobante en estado ${estado}`,
      { id, estado, operacion },
    );
  }
}

export class ComprobanteBloqueadoError extends ConflictError {
  constructor(id: string) {
    super('COMPROBANTE_BLOQUEADO', 'El comprobante está BLOQUEADO; primero reabrí el período', {
      id,
    });
  }
}

/**
 * El comprobante ya fue anulado previamente (flag anulado=true).
 * CLAUDE.md §4.7: la anulación es terminal sobre el ciclo de edición.
 */
export class ComprobanteAnuladoNoAnulableError extends ConflictError {
  constructor(id: string) {
    super('COMPROBANTE_ANULAR_YA_ANULADO', 'El comprobante ya está anulado', { id });
  }
}

/**
 * Se intenta anular un comprobante en estado BORRADOR.
 * CLAUDE.md §4.7: anular un BORRADOR no tiene sentido — la operación
 * correcta es eliminarlo (DELETE /comprobantes/:id).
 * Code: COMPROBANTE_ANULAR_BORRADOR_NO_PERMITIDO — 409.
 */
export class ComprobanteAnularBorradorNoPermitidoError extends ConflictError {
  constructor(id: string) {
    super(
      'COMPROBANTE_ANULAR_BORRADOR_NO_PERMITIDO',
      'No se puede anular un borrador: eliminalo directamente (DELETE /comprobantes/:id)',
      { id },
    );
  }
}

/**
 * Se intenta editar o anular un comprobante en estado BLOQUEADO o en un
 * estado que no es CONTABILIZADO. Aplica a editarContabilizado y a anular.
 * Code: COMPROBANTE_NO_EDITABLE_ESTADO_INVALIDO — 409.
 */
export class ComprobanteEstadoNoEditableContabilizadoError extends ConflictError {
  constructor(id: string, estadoActual: string) {
    super(
      'COMPROBANTE_NO_EDITABLE_ESTADO_INVALIDO',
      `El comprobante no admite esta operación en estado ${estadoActual}`,
      { id, estadoActual },
    );
  }
}

/**
 * El período fiscal del comprobante está cerrado al intentar anularlo.
 * Sin reapertura activa, la anulación se rechaza (CLAUDE.md §4.4 — sin bypass).
 * Code: COMPROBANTE_ANULAR_PERIODO_CERRADO — 409.
 */
export class ComprobanteAnularPeriodoCerradoError extends ConflictError {
  constructor(periodoFiscalId: string, estadoPeriodo: string) {
    super(
      'COMPROBANTE_ANULAR_PERIODO_CERRADO',
      'No se puede anular este comprobante: su período está cerrado. Reabrí el período para continuar',
      { periodoFiscalId, estadoPeriodo },
    );
  }
}

/**
 * El motivo de anulación no tiene la longitud mínima de 10 caracteres
 * significativos (no-whitespace). Invariante de dominio (no DTO validation).
 * Code: COMPROBANTE_ANULAR_MOTIVO_INVALIDO — 422.
 */
export class ComprobanteAnularMotivoInvalidoError extends InvalidStateError {
  static readonly LONGITUD_MINIMA = 10;

  constructor(longitudSignificativa: number) {
    super(
      'COMPROBANTE_ANULAR_MOTIVO_INVALIDO',
      `El motivo de anulación es obligatorio y debe tener al menos ${ComprobanteAnularMotivoInvalidoError.LONGITUD_MINIMA} caracteres significativos (no-whitespace)`,
      {
        longitudSignificativa,
        longitudMinima: ComprobanteAnularMotivoInvalidoError.LONGITUD_MINIMA,
      },
    );
  }
}

/**
 * Se intenta editar un comprobante anulado (anulado=true).
 * CLAUDE.md §4.7: la anulación es terminal sobre el ciclo de edición.
 * Code: COMPROBANTE_ANULADO_NO_EDITABLE — 409.
 */
export class ComprobanteAnuladoNoEditableError extends ConflictError {
  constructor(id: string) {
    super('COMPROBANTE_ANULADO_NO_EDITABLE', 'El comprobante está anulado y no puede editarse', {
      id,
    });
  }
}

/**
 * Se levanta al asociar/desasociar documentos físicos a un comprobante que
 * NO está en BORRADOR. Asociar post-CONTABILIZADO viola la inmutabilidad
 * (CLAUDE.md §4.3). Cubre design §4.6 / REQ-A-02.
 */
export class ComprobanteNoEsBorradorError extends ConflictError {
  constructor(comprobanteId: string, estadoActual: string) {
    super(
      'COMPROBANTE_NO_ES_BORRADOR',
      'El comprobante no admite cambios en sus asociaciones porque no está en BORRADOR',
      { comprobanteId, estadoActual },
    );
  }
}

/**
 * Se levanta al intentar desasociar un documento físico de un comprobante
 * CONTABILIZADO. El comprobante ya consumió su numeración y es inmutable;
 * la única vía de corrección es anular + re-crear (CLAUDE.md §4.3).
 * Cubre REQ-A-03 / escenario E-A-05.
 */
export class ComprobanteDocumentoNoDesasociableContabilizadoError extends ConflictError {
  constructor(comprobanteId: string, documentoFisicoId: string) {
    super(
      'COMPROBANTE_DOCUMENTO_NO_DESASOCIABLE_CONTABILIZADO',
      'No se puede desasociar un documento de un comprobante contabilizado',
      { comprobanteId, documentoFisicoId },
    );
  }
}

export class ComprobanteCamposInmutablesError extends ConflictError {
  constructor(id: string, campos: string[]) {
    super(
      'COMPROBANTE_CAMPOS_INMUTABLES',
      'Los campos numero, tipo, fechaContable y periodoFiscalId son inmutables tras CONTABILIZADO',
      { id, campos },
    );
  }
}

export class PeriodoNoAbiertoError extends ConflictError {
  constructor(periodoFiscalId: string, estado: string) {
    super(
      'COMPROBANTE_PERIODO_NO_ABIERTO',
      `El período fiscal está en estado ${estado}; no admite nuevos comprobantes ni ediciones`,
      { periodoFiscalId, estado },
    );
  }
}

// ============================================================
// 422 — invariantes de dominio violados
// ============================================================

export class ComprobanteSinLineasError extends InvalidStateError {
  constructor(cantidadLineas: number) {
    super('COMPROBANTE_SIN_LINEAS', 'Un comprobante contabilizado requiere al menos 2 líneas', {
      cantidadLineas,
      minimo: 2,
    });
  }
}

export class ComprobanteDesbalanceadoError extends InvalidStateError {
  constructor(totalDebitoBob: string, totalCreditoBob: string, diffBob: string) {
    super(
      'COMPROBANTE_DESBALANCEADO',
      'Los débitos deben igualar a los créditos en BOB (tolerancia ±Bs 0.01)',
      { totalDebitoBob, totalCreditoBob, diffBob },
    );
  }
}

export class ComprobanteMontoCeroError extends InvalidStateError {
  constructor() {
    super('COMPROBANTE_MONTO_CERO', 'No se puede contabilizar un comprobante con monto total cero');
  }
}

export class GlosaRequeridaError extends InvalidStateError {
  constructor() {
    super('COMPROBANTE_GLOSA_REQUERIDA', 'La glosa es obligatoria y no puede estar vacía');
  }
}

export class LineaSinMontoError extends InvalidStateError {
  constructor(orden: number) {
    super('COMPROBANTE_LINEA_SIN_MONTO', `La línea ${orden} no tiene débito ni crédito (>0)`, {
      orden,
    });
  }
}

export class LineaAmbiguaDebitoCreditoError extends InvalidStateError {
  constructor(orden: number) {
    super(
      'COMPROBANTE_LINEA_AMBIGUA_DEBITO_CREDITO',
      `La línea ${orden} tiene débito y crédito simultáneamente; una línea es solo DEBE o solo HABER`,
      { orden },
    );
  }
}

export class MontoBobIncoherenteError extends InvalidStateError {
  constructor(
    orden: number,
    detalle: {
      monto: string;
      tipoCambio: string;
      montoBobEsperado: string;
      montoBobRecibido: string;
    },
  ) {
    super(
      'COMPROBANTE_MONTO_BOB_INCOHERENTE',
      `La línea ${orden}: montoBob no coincide con monto × tipoCambio (tolerancia ±Bs 0.01)`,
      { orden, ...detalle },
    );
  }
}

export class TipoCambioInvalidoError extends InvalidStateError {
  constructor(orden: number, detalle: { moneda: string; tipoCambio: string }) {
    super(
      'COMPROBANTE_TIPO_CAMBIO_INVALIDO',
      `La línea ${orden}: tipo de cambio inválido para la moneda especificada`,
      { orden, ...detalle },
    );
  }
}

export class FechaFuturaNoPermitidaError extends InvalidStateError {
  constructor(fechaContable: string, hoy: string) {
    super(
      'COMPROBANTE_FECHA_FUTURA_NO_PERMITIDA',
      `La fecha contable ${fechaContable} es posterior a hoy (${hoy}); no se permiten asientos al futuro`,
      { fechaContable, hoy },
    );
  }
}

export class CuentaNoDetalleError extends InvalidStateError {
  constructor(orden: number, cuentaId: string, codigoInterno: string) {
    super(
      'COMPROBANTE_CUENTA_NO_DETALLE',
      `La línea ${orden}: la cuenta ${codigoInterno} no es cuenta de detalle (es agrupadora)`,
      { orden, cuentaId, codigoInterno },
    );
  }
}

export class CuentaInactivaError extends InvalidStateError {
  constructor(orden: number, cuentaId: string, codigoInterno: string) {
    super(
      'COMPROBANTE_CUENTA_INACTIVA',
      `La línea ${orden}: la cuenta ${codigoInterno} está inactiva`,
      { orden, cuentaId, codigoInterno },
    );
  }
}

export class ContactoRequeridoError extends InvalidStateError {
  constructor(orden: number, cuentaId: string, codigoInterno: string) {
    super(
      'COMPROBANTE_CONTACTO_REQUERIDO',
      `La línea ${orden}: la cuenta ${codigoInterno} requiere contacto asociado`,
      { orden, cuentaId, codigoInterno },
    );
  }
}

export class ContactoReferenciadoNoExisteError extends InvalidStateError {
  constructor(orden: number, contactoId: string) {
    super(
      'COMPROBANTE_CONTACTO_NO_EXISTE',
      `La línea ${orden}: el contacto referenciado no existe`,
      { orden, contactoId },
    );
  }
}

export class ContactoInactivoError extends InvalidStateError {
  constructor(orden: number, contactoId: string) {
    super(
      'COMPROBANTE_CONTACTO_INACTIVO',
      `La línea ${orden}: el contacto está inactivo. Reactivalo o usá otro antes de contabilizar.`,
      { orden, contactoId },
    );
  }
}

export class MonedaIncompatibleCuentaError extends InvalidStateError {
  constructor(
    orden: number,
    detalle: {
      cuentaId: string;
      codigoInterno: string;
      monedaLinea: string;
      monedaFuncional: string;
    },
  ) {
    super(
      'COMPROBANTE_MONEDA_INCOMPATIBLE_CUENTA',
      `La línea ${orden}: la cuenta no permite la moneda usada`,
      { orden, ...detalle },
    );
  }
}

export class GestionNoAbiertaError extends InvalidStateError {
  constructor(fechaContable: string) {
    super(
      'COMPROBANTE_GESTION_NO_ABIERTA',
      `No existe un período fiscal para la fecha ${fechaContable}. Creá la gestión primero.`,
      { fechaContable },
    );
  }
}

/**
 * Se levanta al asociar un DocumentoFisico a un Comprobante cuyo `tipo`
 * no está incluido en `TipoDocumentoFisico.tiposComprobanteAplicables`.
 *
 * Reside en este módulo porque lo lanza `ComprobantesService.asociarDocumentos`
 * (design §4.2/§4.6): el flujo de asociación es orquestado por `comprobantes`,
 * que es la cabecera y dueña del flujo. La matriz de aplicabilidad del tipo
 * llega proyectada vía `DocumentosFisicosReaderPort` (dependencia unidireccional
 * comprobantes → documentos-fisicos, §4.5), sin acoplar dominios.
 *
 * Cubre REQ-A-11 / proposal D11.
 */
export class TipoDocumentoIncompatibleConComprobanteError extends InvalidStateError {
  constructor(tipoDocumentoNombre: string, tipoComprobante: string, tiposPermitidos: string[]) {
    super(
      'TIPO_DOCUMENTO_INCOMPATIBLE_CON_COMPROBANTE',
      `El tipo de documento '${tipoDocumentoNombre}' no es aplicable a comprobantes de tipo ${tipoComprobante}. Tipos permitidos: ${tiposPermitidos.join(', ')}`,
      { tipoDocumentoNombre, tipoComprobante, tiposPermitidos },
    );
  }
}

/**
 * El período fiscal origen del comprobante CONTABILIZADO está cerrado
 * al intentar editarlo. Sin reapertura activa, la edición se rechaza.
 * Code: COMPROBANTE_EDIT_PERIODO_CERRADO — 409.
 */
export class ComprobanteEditarContabilizadoEnPeriodoCerradoError extends ConflictError {
  constructor(periodoFiscalId: string, estadoPeriodo: string) {
    super(
      'COMPROBANTE_EDIT_PERIODO_CERRADO',
      'No se puede editar este comprobante: su período está cerrado. Reabrí el período para continuar',
      { periodoFiscalId, estadoPeriodo },
    );
  }
}

/**
 * La nueva fechaContable apunta a un período destino que está cerrado.
 * Mover un comprobante a un período cerrado está prohibido.
 * Code: COMPROBANTE_EDIT_PERIODO_DESTINO_CERRADO — 409.
 */
export class ComprobanteEditarFechaPeriodoDestinoCerradoError extends ConflictError {
  constructor(periodoFiscalId: string, estadoPeriodo: string) {
    super(
      'COMPROBANTE_EDIT_PERIODO_DESTINO_CERRADO',
      'No se puede mover el comprobante: el período destino está cerrado',
      { periodoFiscalId, estadoPeriodo },
    );
  }
}

/**
 * El payload de edición incluye el campo `numero` con un valor distinto
 * al actual. El número correlativo es inmutable desde la primera contabilización
 * (CLAUDE.md §4.9 — REQ-COMP-CORRELATIVO-02).
 *
 * Extiende ConflictError → HTTP 409. Es invariante de dominio (no protocolo),
 * per alineación de tasks-tail §6: 409 NOT 400.
 */
export class NumeroCorrelativoInmutableError extends ConflictError {
  constructor(id: string, numeroActual: string, numeroRecibido: string) {
    super(
      'COMPROBANTE_EDIT_NUMERO_INMUTABLE',
      'El número del comprobante es inmutable y no puede modificarse',
      { id, numeroActual, numeroRecibido },
    );
  }
}

/**
 * Se intenta usar `editarContabilizado` sin tener el permiso RBAC
 * `contabilidad.asientos.edit-posted` (REQ-COMP-EDIT-10).
 */
export class SinPermisoEditarContabilizadoError extends ForbiddenError {
  constructor(userId: string) {
    super(
      'MISSING_PERMISSION_EDIT_POSTED',
      'No tenés permiso para editar comprobantes contabilizados',
      { userId, permiso: 'contabilidad.asientos.edit-posted' },
    );
  }
}

// ============================================================
// 400 — input malformado a nivel protocolo (DTO)
// ============================================================

export class MotivoAnulacionRequeridoError extends ValidationError {
  static readonly LONGITUD_MINIMA = 10;

  constructor(longitudRecibida: number) {
    super(
      'COMPROBANTE_MOTIVO_ANULACION_REQUERIDO',
      `El motivo de anulación es obligatorio y debe tener al menos ${MotivoAnulacionRequeridoError.LONGITUD_MINIMA} caracteres`,
      { longitudRecibida, longitudMinima: MotivoAnulacionRequeridoError.LONGITUD_MINIMA },
    );
  }
}

/**
 * Se intenta crear/editar un comprobante con `monedaPrincipal` distinta a BOB.
 * Decisión de alcance (CLAUDE.md §10.10): el campo soporta el enum `Moneda`
 * completo a nivel schema, pero la fase actual lo bloquea a BOB — el multi-moneda
 * es un campo de PRESENTACIÓN (`tipoCambioReexpresion`), no transaccional.
 *
 * La FORMA (enum válido) se valida en el DTO; esta regla de ALCANCE vive en el
 * servicio para exponer un code ESTABLE: un integrador distingue "moneda no
 * soportada aún" del BAD_REQUEST genérico de un payload malformado.
 * Code: COMPROBANTE_MONEDA_NO_PERMITIDA — 400.
 */
export class ComprobanteMonedaNoPermitidaError extends ValidationError {
  constructor(monedaRecibida: string) {
    super('COMPROBANTE_MONEDA_NO_PERMITIDA', 'La moneda principal del comprobante debe ser BOB', {
      monedaRecibida,
      monedasPermitidas: ['BOB'],
    });
  }
}

/**
 * Un campo del comprobante llegó con FORMA válida (pasó el shape del DTO) pero
 * con un valor semánticamente inválido. Hoy lo usa `tipoCambioReexpresion`
 * (debe ser decimal estrictamente positivo). El code es genérico y lleva el
 * campo en `details` para que el cliente lo ubique.
 * Code: COMPROBANTE_CAMPO_INVALIDO — 400.
 */
export class ComprobanteCampoInvalidoError extends ValidationError {
  constructor(campo: string, valorRecibido: string, motivo: string) {
    super('COMPROBANTE_CAMPO_INVALIDO', `El campo "${campo}" tiene un valor inválido: ${motivo}`, {
      campo,
      valorRecibido,
      motivo,
    });
  }
}
