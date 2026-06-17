/**
 * Errores de dominio del módulo `cierre-ejercicio` — namespace `CIERRE_EJERCICIO_*`.
 *
 * Los `code` son IDs ESTABLES hacia el cliente (CLAUDE.md §6.3); el
 * GlobalExceptionFilter los mapea al formato estándar de respuesta (§6.4).
 *
 * UNIFICACIÓN del code `CIERRE_EJERCICIO_GESTION_YA_CERRADA`:
 *   El Batch 2 ya creó `CierreGestionCerradaError` en
 *   `comprobantes/domain/comprobante-errors.ts` (lo lanza `comprobantes.service`
 *   al anular un cierre cuya gestión está CERRADA). Para que ese code sea ÚNICO
 *   en todo el sistema NO se redeclara la clase aquí: este módulo la **reexporta**
 *   desde comprobantes. Es un `DomainError` puro (sin NestJS ni Prisma), por lo
 *   que importarlo no viola la pureza del dominio del cierre. Así el módulo
 *   cierre-ejercicio expone una única superficie de errores sin duplicar codes.
 */

import { ConflictError, DomainError, InvalidStateError, NotFoundError } from '@/common/errors';

// Reexport del error canónico (definido en comprobantes para evitar el ciclo
// comprobantes↔cierre-ejercicio del Batch 2). Code: CIERRE_EJERCICIO_GESTION_YA_CERRADA.
export { CierreGestionCerradaError } from '@/comprobantes/domain/comprobante-errors';

// ============================================================
// 404 — gestión inexistente o no visible para el tenant
// ============================================================

/**
 * No existe la gestión fiscal indicada para este tenant.
 * Defense in depth (§4.2): no distingue "no existe" de "no es tuyo".
 * Code: CIERRE_EJERCICIO_GESTION_NO_ENCONTRADA — 404.
 */
export class CierreGestionNoEncontradaError extends NotFoundError {
  constructor(gestionId: string) {
    super('CIERRE_EJERCICIO_GESTION_NO_ENCONTRADA', 'La gestión fiscal no existe', { gestionId });
  }
}

// ============================================================
// 409 — estado de la gestión / cierre incompatible con la operación
// ============================================================

/**
 * Se intenta regenerar el cierre cuando al menos uno de los 3 comprobantes ya
 * está CONTABILIZADO. Para rehacer hay que anular los contabilizados primero.
 * Code: CIERRE_EJERCICIO_PARCIALMENTE_CONTABILIZADO — 409.
 */
export class CierreYaParcialmenteContabilizadoError extends ConflictError {
  constructor(gestionId?: string) {
    super(
      'CIERRE_EJERCICIO_PARCIALMENTE_CONTABILIZADO',
      'El cierre ya tiene comprobantes contabilizados; anulalos antes de regenerar',
      gestionId !== undefined ? { gestionId } : undefined,
    );
  }
}

/**
 * El gate de períodos previos no se cumple: para cerrar la gestión los 11
 * períodos previos deben estar CERRADO y el período del mesCierre ABIERTO.
 * Code: CIERRE_EJERCICIO_PERIODO_NO_LISTO — 409.
 */
export class CierrePeriodoNoListoError extends ConflictError {
  constructor(detalle?: Record<string, unknown>) {
    super(
      'CIERRE_EJERCICIO_PERIODO_NO_LISTO',
      'Los períodos de la gestión no están listos para el cierre (previos CERRADO y mesCierre ABIERTO)',
      detalle,
    );
  }
}

// ============================================================
// 422 — invariantes de configuración / datos
// ============================================================

/**
 * La gestión no tiene ninguna cuenta de resultado (INGRESO/EGRESO) con
 * movimiento: no hay nada que cerrar.
 * Code: CIERRE_EJERCICIO_SIN_MOVIMIENTO — 422.
 */
export class CierreSinResultadoError extends InvalidStateError {
  constructor() {
    super(
      'CIERRE_EJERCICIO_SIN_MOVIMIENTO',
      'La gestión no tiene cuentas de resultado con movimiento; no hay nada que cerrar',
    );
  }
}

/**
 * Falta configurar una de las cuentas destino del cierre
 * (`resultadoEjercicioId` transitoria o `resultadosAcumuladosId`).
 * Code: CIERRE_EJERCICIO_CUENTA_DESTINO_FALTANTE — 422.
 */
export class CierreConfigCuentaFaltanteError extends InvalidStateError {
  constructor(campoFaltante: string) {
    super(
      'CIERRE_EJERCICIO_CUENTA_DESTINO_FALTANTE',
      `Falta configurar la cuenta destino del cierre: ${campoFaltante}`,
      { campoFaltante },
    );
  }
}

// ============================================================
// 500 — bug de dominio (no debería ocurrir nunca)
// ============================================================

/**
 * Un builder de cierre generó líneas que no cuadran en partida doble
 * (Σdebe ≠ Σhaber, ±Bs 0.01). Código Tributario art. 47: partida doble
 * obligatoria. Es un bug de dominio — el builder debe garantizar el cuadre.
 * Code: CIERRE_EJERCICIO_PARTIDA_DOBLE — 500.
 */
export class CierrePartidaDobleError extends DomainError {
  readonly httpStatus = 500;

  constructor(totalDebitoBob: string, totalCreditoBob: string, diffBob: string) {
    super(
      'CIERRE_EJERCICIO_PARTIDA_DOBLE',
      'El asiento de cierre no cuadra en partida doble (bug de dominio)',
      { totalDebitoBob, totalCreditoBob, diffBob },
    );
  }
}
