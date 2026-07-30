/**
 * Errores de dominio del módulo `cuentas-por-cobrar` (§6.2): namespaces
 * `COBRO_*` / `APLICACION_*`, codes estables. Molde: `ventas/domain/venta-errors.ts`.
 *
 * Fuera de este archivo viven, junto a la regla que los produce:
 * - `APLICACION_MONTO_NO_POSITIVO` en `sobre-aplicacion.ts`
 * - `COBRO_ASIENTO_SIN_MONTO` en `asiento-cobro.ts`
 */

import { Money } from '@/common/domain/money';
import { ConflictError, InvalidStateError, NotFoundError } from '@/common/errors';

// ============================================================
// 404 — recursos inexistentes o de otro tenant (§4.2: no se distinguen)
// ============================================================

/** Code: COBRO_NO_ENCONTRADO — 404. Cobro ajeno → mismo 404 (REQ-CXC-08). */
export class CobroNoEncontradoError extends NotFoundError {
  constructor(cobroId: string) {
    super('COBRO_NO_ENCONTRADO', 'El cobro no existe', { cobroId });
  }
}

// ============================================================
// 422 — estado inválido del documento o de la configuración
// ============================================================

/**
 * `cuentasPorCobrarId` sin mapear en `OrgConfiguracionContable` (B-12, espejo
 * de `VENTA_CONCEPTO_NO_CONFIGURADO`): un error de dominio con nombre — nunca
 * un 500. A diferencia de ventas, acá el único concepto posible es la CxC, así
 * que el constructor no lo parametriza.
 * Code: COBRO_CONCEPTO_NO_CONFIGURADO — 422.
 */
export class CobroConceptoNoConfiguradoError extends InvalidStateError {
  constructor() {
    super(
      'COBRO_CONCEPTO_NO_CONFIGURADO',
      'La organización no tiene configurada la cuenta del concepto cuentasPorCobrarId. Mapeala en la configuración contable antes de registrar el cobro.',
      { concepto: 'cuentasPorCobrarId' },
    );
  }
}

/**
 * Cuenta destino fuera del criterio de elegibilidad de REQ-CXC-02
 * (`activa ∧ esDetalle ∧ (actividadFlujo = 'EFECTIVO' ∪ prefijo 1.1.1)`, unión
 * POR CUENTA — PA-1). Ausente, inexistente, ajena o no elegible colapsan acá:
 * para el usuario son el mismo hecho ("no podés cobrar ahí") y distinguirlos
 * revelaría recursos de otro tenant (§4.2). Una organización sin NINGUNA
 * cuenta elegible cae en este mismo 422 (la spec prohíbe duplicarlo con un
 * `*_CONCEPTO_NO_CONFIGURADO`).
 * Code: COBRO_CUENTA_DESTINO_NO_ELEGIBLE — 422.
 */
export class CobroCuentaDestinoNoElegibleError extends InvalidStateError {
  constructor(cuentaDestinoId: string | null) {
    super(
      'COBRO_CUENTA_DESTINO_NO_ELEGIBLE',
      'La cuenta destino del cobro no es elegible para recibir efectivo',
      { cuentaDestinoId },
    );
  }
}

/**
 * Bajar el `monto` del cobro POR DEBAJO de lo ya aplicado (REQ-CXC-06, matriz
 * fila 8): el sistema NO recorta solo — el reparto es entre ventas
 * distinguibles y el usuario desaplica primero. Los `details` indican cuánto
 * hay que desaplicar, como exige el escenario de la spec.
 * Code: COBRO_MONTO_INFERIOR_APLICADO — 422.
 */
export class CobroMontoInferiorAplicadoError extends InvalidStateError {
  constructor(montoNuevo: Money, totalAplicado: Money) {
    super(
      'COBRO_MONTO_INFERIOR_APLICADO',
      `El cobro tiene ${totalAplicado.toBob()} Bs ya aplicados a ventas: no puede bajar a ${montoNuevo.toBob()} Bs. Desaplicá ${totalAplicado.minus(montoNuevo).toBob()} Bs primero.`,
      {
        montoNuevoBob: montoNuevo.toBob(),
        totalAplicadoBob: totalAplicado.toBob(),
        montoADesaplicarBob: totalAplicado.minus(montoNuevo).toBob(),
      },
    );
  }
}

/**
 * Σ aplicaciones superaría el monto del cobro (REQ-CXC-04, B-6). Los `details`
 * llevan los cuatro montos que el usuario necesita para decidir: cuánto es el
 * cobro, cuánto ya repartió, cuánto pidió y cuánto le queda.
 * Code: APLICACION_EXCEDE_COBRO — 422.
 */
export class AplicacionExcedeCobroError extends InvalidStateError {
  constructor(cobroId: string, montoCobro: Money, totalAplicado: Money, montoSolicitado: Money) {
    super(
      'APLICACION_EXCEDE_COBRO',
      `La aplicación excede el cobro: quedan ${montoCobro.minus(totalAplicado).toBob()} Bs disponibles y se intentó aplicar ${montoSolicitado.toBob()} Bs`,
      {
        cobroId,
        montoCobroBob: montoCobro.toBob(),
        totalAplicadoBob: totalAplicado.toBob(),
        montoSolicitadoBob: montoSolicitado.toBob(),
        disponibleBob: montoCobro.minus(totalAplicado).toBob(),
      },
    );
  }
}

/**
 * Σ aplicaciones superaría el total de la venta (REQ-CXC-04, B-6).
 * Code: APLICACION_EXCEDE_VENTA — 422.
 */
export class AplicacionExcedeVentaError extends InvalidStateError {
  constructor(
    ventaId: string,
    montoTotalVenta: Money,
    totalAplicado: Money,
    montoSolicitado: Money,
  ) {
    super(
      'APLICACION_EXCEDE_VENTA',
      `La aplicación excede la venta: quedan ${montoTotalVenta.minus(totalAplicado).toBob()} Bs por cobrar y se intentó aplicar ${montoSolicitado.toBob()} Bs`,
      {
        ventaId,
        montoTotalVentaBob: montoTotalVenta.toBob(),
        totalAplicadoBob: totalAplicado.toBob(),
        montoSolicitadoBob: montoSolicitado.toBob(),
        disponibleBob: montoTotalVenta.minus(totalAplicado).toBob(),
      },
    );
  }
}

/**
 * Ambas puntas de una aplicación DEBEN ser del mismo `contactoId`
 * (REQ-CXC-03): no se aplica plata del cliente A a una deuda del cliente B.
 * Code: APLICACION_CONTACTO_DISTINTO — 422.
 */
export class AplicacionContactoDistintoError extends InvalidStateError {
  constructor(contactoCobroId: string, contactoVentaId: string) {
    super(
      'APLICACION_CONTACTO_DISTINTO',
      'El cobro y la venta pertenecen a clientes distintos: no se puede aplicar',
      { contactoCobroId, contactoVentaId },
    );
  }
}

/**
 * No existe período fiscal que cubra la `fechaContable` del cobro
 * (REQ-CXC-09 / §4.4): el tenant debe crear la gestión primero. Espejo de
 * `VENTA_GESTION_NO_ABIERTA`.
 * Code: COBRO_GESTION_NO_ABIERTA — 422.
 */
export class CobroGestionNoAbiertaError extends InvalidStateError {
  constructor(fechaContable: string) {
    super(
      'COBRO_GESTION_NO_ABIERTA',
      `No existe un período fiscal para la fecha ${fechaContable}. Creá la gestión primero.`,
      { fechaContable },
    );
  }
}

// ============================================================
// 409 — conflictos de estado
// ============================================================

/**
 * Period lock sin bypass (REQ-CXC-09, §4.4): el período de la `fechaContable`
 * no está ABIERTO — el cobro es un hecho contable y no se crea, edita ni
 * anula ahí. El ÚNICO camino es la reapertura formal
 * (`PeriodoFiscalReopening`). Las APLICACIONES quedan explícitamente fuera de
 * este lock (REQ-CXC-03: no son hechos contables). OJO vocabulario:
 * `PeriodoFiscalStatus` es `ABIERTO | CERRADO`; no existe un período
 * `BLOQUEADO` (ese es un valor de `EstadoComprobante`).
 * Code: COBRO_PERIODO_NO_ABIERTO — 409.
 */
export class CobroPeriodoNoAbiertoError extends ConflictError {
  constructor(periodoFiscalId: string, status: string) {
    super(
      'COBRO_PERIODO_NO_ABIERTO',
      `El período fiscal está en estado ${status}: no admite cobros nuevos ni cambios. Para modificarlo, un administrador debe reabrir el período (flujo de reapertura formal).`,
      { periodoFiscalId, status },
    );
  }
}

/**
 * §4.7: la anulación es terminal — un cobro anulado no se edita ni se vuelve
 * a anular. Su comprobante y su número se preservan para siempre. Espejo de
 * `VENTA_ANULADA_NO_EDITABLE`.
 * Code: COBRO_ANULADO_NO_EDITABLE — 409.
 */
export class CobroAnuladoNoEditableError extends ConflictError {
  constructor(cobroId: string) {
    super(
      'COBRO_ANULADO_NO_EDITABLE',
      'El cobro está anulado: no admite ediciones ni una nueva anulación',
      { cobroId },
    );
  }
}
