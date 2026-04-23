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

import { ConflictError, InvalidStateError, NotFoundError, ValidationError } from '@/common/errors';

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

export class ComprobanteYaAnuladoError extends ConflictError {
  constructor(id: string) {
    super('COMPROBANTE_YA_ANULADO', 'El comprobante ya está anulado', { id });
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

export class PeriodoReversionNoAbiertoError extends ConflictError {
  constructor(fecha: string) {
    super(
      'COMPROBANTE_PERIODO_REVERSION_NO_ABIERTO',
      'La fecha de hoy cae en un período cerrado; no se puede contabilizar la reversión',
      { fecha },
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
