/**
 * Errores de dominio del módulo `ventas` (§6.2): namespace `VENTA_*`, codes
 * estables. Los errores del BUILDER del asiento (`VENTA_ASIENTO_*`) viven en
 * `asiento-venta.ts` junto a la regla que los produce.
 */

import { ConflictError, InvalidStateError, NotFoundError } from '@/common/errors';

// ============================================================
// 404 — recursos inexistentes o de otro tenant (§4.2: no se distinguen)
// ============================================================

/** Code: VENTA_NO_ENCONTRADA — 404. Venta ajena → mismo 404 (REQ-VTA-08). */
export class VentaNoEncontradaError extends NotFoundError {
  constructor(ventaId: string) {
    super('VENTA_NO_ENCONTRADA', 'La venta no existe', { ventaId });
  }
}

/** Code: VENTA_CONTACTO_NO_ENCONTRADO — 404. Cruce contra el MISMO tenant (REQ-VTA-08). */
export class VentaContactoNoEncontradoError extends NotFoundError {
  constructor(contactoId: string) {
    super('VENTA_CONTACTO_NO_ENCONTRADO', 'El cliente de la venta no existe', { contactoId });
  }
}

/** Code: VENTA_ITEM_NO_ENCONTRADO — 404. El batch acotado al tenant no lo devolvió (REQ-VTA-08). */
export class VentaItemNoEncontradoError extends NotFoundError {
  constructor(itemId: string) {
    super('VENTA_ITEM_NO_ENCONTRADO', 'El ítem de una línea de la venta no existe', { itemId });
  }
}

// ============================================================
// 422 — estado inválido del documento o de la configuración
// ============================================================

/**
 * CREDITO exige `fechaVencimiento` y CONTADO la prohíbe (REQ-VTA-02). Un solo
 * code para las dos direcciones — así lo fija la tabla de errores de la spec.
 * Code: VENTA_VENCIMIENTO_REQUERIDO — 422.
 */
export class VentaVencimientoRequeridoError extends InvalidStateError {
  constructor(condicionPago: 'CONTADO' | 'CREDITO') {
    super(
      'VENTA_VENCIMIENTO_REQUERIDO',
      condicionPago === 'CREDITO'
        ? 'Una venta a crédito exige fecha de vencimiento'
        : 'Una venta al contado no lleva fecha de vencimiento',
      { condicionPago },
    );
  }
}

/**
 * `cuentasPorCobrarId` / `ventasId` sin mapear en `OrgConfiguracionContable`
 * (REQ-VTA-10 / B-12): un error de dominio con nombre — nunca un 500 — que
 * nombra el concepto faltante en `details`.
 * Code: VENTA_CONCEPTO_NO_CONFIGURADO — 422.
 */
export class VentaConceptoNoConfiguradoError extends InvalidStateError {
  constructor(concepto: 'cuentasPorCobrarId' | 'ventasId') {
    super(
      'VENTA_CONCEPTO_NO_CONFIGURADO',
      `La organización no tiene configurada la cuenta del concepto ${concepto}. Mapeala en la configuración contable antes de registrar la venta.`,
      { concepto },
    );
  }
}

/**
 * Cuenta destino del CONTADO fuera del criterio de efectivo/equivalentes
 * (PA-1; el criterio vive en REQ-CXC-02 y lo evalúa `cuentas` vía
 * `CuentasEfectivoReaderPort`). Ausente, inexistente, ajena o no elegible
 * colapsan acá: para el vendedor son el mismo hecho ("no podés cobrar ahí") y
 * distinguirlos revelaría recursos de otro tenant (§4.2).
 * Code: VENTA_CUENTA_DESTINO_NO_ELEGIBLE — 422.
 */
export class VentaCuentaDestinoNoElegibleError extends InvalidStateError {
  constructor(cuentaDestinoId: string | null) {
    super(
      'VENTA_CUENTA_DESTINO_NO_ELEGIBLE',
      'La cuenta destino de la venta al contado no es elegible para recibir efectivo',
      { cuentaDestinoId },
    );
  }
}

/** Code: VENTA_ITEM_INACTIVO — 422. El catálogo desactiva, no borra (REQ-ITM): no se vende un ítem inactivo. */
export class VentaItemInactivoError extends InvalidStateError {
  constructor(itemId: string) {
    super('VENTA_ITEM_INACTIVO', 'El ítem de una línea de la venta está inactivo', { itemId });
  }
}

/** Code: VENTA_CONTACTO_INACTIVO — 422. No se registra una venta a un cliente desactivado. */
export class VentaContactoInactivoError extends InvalidStateError {
  constructor(contactoId: string) {
    super('VENTA_CONTACTO_INACTIVO', 'El cliente de la venta está inactivo', { contactoId });
  }
}

/**
 * El snapshot `cuentaIngresoId` de una línea apunta a una cuenta hoy inactiva
 * o que dejó de ser de detalle (REQ-VTA-05): el camino de sistema RE-VALIDA,
 * no bypassea — la cuenta es configuración almacenada y pudo desactivarse
 * después de crear la venta. NOMBRA la cuenta (la spec lo exige) porque el
 * usuario tiene que saber cuál reactivar o qué línea re-crear.
 * Code: VENTA_CUENTA_SNAPSHOT_INACTIVA — 422.
 */
export class VentaCuentaSnapshotInactivaError extends InvalidStateError {
  constructor(cuentaId: string, cuenta: { codigoInterno: string; nombre: string } | null) {
    super(
      'VENTA_CUENTA_SNAPSHOT_INACTIVA',
      cuenta === null
        ? 'La cuenta de ingreso registrada en una línea de la venta ya no existe en el plan de cuentas'
        : `La cuenta ${cuenta.codigoInterno} — ${cuenta.nombre}, registrada en una línea de la venta, está inactiva o dejó de ser de detalle`,
      { cuentaId, ...(cuenta !== null ? cuenta : {}) },
    );
  }
}

/**
 * No existe período fiscal que cubra la `fechaContable` (REQ-VTA-09 / §4.4):
 * el tenant debe crear la gestión primero. Espejo de
 * `COMPROBANTE_GESTION_NO_ABIERTA` en vocabulario de ventas.
 * Code: VENTA_GESTION_NO_ABIERTA — 422.
 */
export class VentaGestionNoAbiertaError extends InvalidStateError {
  constructor(fechaContable: string) {
    super(
      'VENTA_GESTION_NO_ABIERTA',
      `No existe un período fiscal para la fecha ${fechaContable}. Creá la gestión primero.`,
      { fechaContable },
    );
  }
}

// ============================================================
// 409 — conflictos de estado
// ============================================================

/**
 * Period lock sin bypass (REQ-VTA-09, §4.4): el período de la `fechaContable`
 * no está ABIERTO. El ÚNICO camino es la reapertura formal
 * (`PeriodoFiscalReopening`) — sin contraseña de override ni excepción de
 * admin. OJO vocabulario: `PeriodoFiscalStatus` es `ABIERTO | CERRADO`; no
 * existe un período `BLOQUEADO` (ese es un valor de `EstadoComprobante`).
 * Code: VENTA_PERIODO_NO_ABIERTO — 409.
 */
export class VentaPeriodoNoAbiertoError extends ConflictError {
  constructor(periodoFiscalId: string, status: string) {
    super(
      'VENTA_PERIODO_NO_ABIERTO',
      `El período fiscal está en estado ${status}: no admite ventas nuevas ni cambios. Para modificarlo, un administrador debe reabrir el período (flujo de reapertura formal).`,
      { periodoFiscalId, status },
    );
  }
}

/**
 * La operación exige que la venta siga en BORRADOR (REQ-VTA-01): un
 * comprobante CONTABILIZADO no se borra — se anula (§4.7) — y no se vuelve a
 * contabilizar.
 * Code: VENTA_NO_ES_BORRADOR — 409.
 */
export class VentaNoEsBorradorError extends ConflictError {
  constructor(ventaId: string, estado: string) {
    super('VENTA_NO_ES_BORRADOR', `La venta ya no es un borrador (estado ${estado})`, {
      ventaId,
      estado,
    });
  }
}

/**
 * §4.7: la anulación es terminal — una venta anulada no se edita, no se
 * contabiliza y no se vuelve a anular. Su comprobante y su número se
 * preservan para siempre.
 * Code: VENTA_ANULADA_NO_EDITABLE — 409.
 */
export class VentaAnuladaNoEditableError extends ConflictError {
  constructor(ventaId: string) {
    super(
      'VENTA_ANULADA_NO_EDITABLE',
      'La venta está anulada: no admite ediciones ni una nueva anulación',
      { ventaId },
    );
  }
}
