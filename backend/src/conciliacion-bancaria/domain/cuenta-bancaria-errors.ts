/**
 * Errores de dominio del módulo `conciliacion-bancaria` para el sub-dominio
 * `CuentaBancaria`. Subclases de `DomainError` que el `GlobalExceptionFilter`
 * mapea al formato estándar de respuesta (CLAUDE.md §6.4).
 *
 * Los `code` son IDs ESTABLES hacia el cliente, formato
 * `CONCILIACION_{SUBDOMINIO}_{CONDICION}` (CLAUDE.md §6.3).
 */

import { ConflictError, InvalidStateError, NotFoundError } from '@/common/errors';

// ============================================================
// 404 — recurso no existente (o no visible para el tenant actual)
// ============================================================

export class CuentaBancariaNoEncontradaError extends NotFoundError {
  constructor(id: string) {
    super('CONCILIACION_CUENTA_BANCARIA_NO_ENCONTRADA', 'La cuenta bancaria no existe', { id });
  }
}

/** `cuentaId` no resuelve contra el plan de cuentas del tenant activo (id inexistente u otro tenant). */
export class CuentaPlanNoEncontradaError extends NotFoundError {
  constructor(cuentaId: string) {
    super('CONCILIACION_CUENTA_PLAN_NO_ENCONTRADA', 'La cuenta del plan de cuentas no existe', {
      cuentaId,
    });
  }
}

// ============================================================
// 409 — conflictos de estado / unicidad
// ============================================================

// REQ-CB-01: `@@unique([organizationId, cuentaId])` — una cuenta del plan
// mapea a lo sumo una CuentaBancaria.
export class CuentaBancariaYaVinculadaError extends ConflictError {
  constructor(cuentaId: string) {
    super(
      'CONCILIACION_CUENTA_BANCARIA_YA_VINCULADA',
      'Esta cuenta del plan ya está vinculada a otra cuenta bancaria',
      { cuentaId },
    );
  }
}

// CRITICAL-5 / REQ-CB-01: `@@unique([organizationId, perfilExtracto, numeroCuenta])`
// — defense in depth del pre-check de servicio (CLAUDE.md §4.8), la constraint
// de DB es el enforcement duro.
export class CuentaBancariaNumeroDuplicadoError extends ConflictError {
  constructor(perfilExtracto: string, numeroCuenta: string) {
    super(
      'CONCILIACION_CUENTA_BANCARIA_NUMERO_DUPLICADO',
      'Ya existe una cuenta bancaria con este perfil y número de cuenta',
      { perfilExtracto, numeroCuenta },
    );
  }
}

// FK Restrict desde movimientos_bancarios/importaciones_extracto.cuentaBancariaId
// (defense in depth, CLAUDE.md §4.8 — las tablas hijas llegan en slice 3, pero
// el adapter ya mapea el P2003 si algo referencia la fila).
export class CuentaBancariaConMovimientosError extends ConflictError {
  constructor(id: string) {
    super(
      'CONCILIACION_CUENTA_BANCARIA_CON_MOVIMIENTOS',
      'No se puede eliminar la cuenta bancaria porque tiene movimientos o importaciones asociadas',
      { id },
    );
  }
}

// ============================================================
// 422 — estado inválido para la operación solicitada
// ============================================================

// REQ-CB-01: la Cuenta elegida DEBE ser esDetalle=true AND activa=true.
export class CuentaPlanInvalidaError extends InvalidStateError {
  constructor(cuentaId: string, motivo: 'NO_ES_DETALLE' | 'INACTIVA') {
    const mensaje =
      motivo === 'NO_ES_DETALLE'
        ? 'La cuenta del plan debe ser una cuenta de detalle (esDetalle=true)'
        : 'La cuenta del plan está inactiva';
    super('CONCILIACION_CUENTA_PLAN_INVALIDA', mensaje, { cuentaId, motivo });
  }
}

// REQ-CB-02: un extracto tiene una única moneda por definición. Si
// cuenta.permiteMultiMoneda=false, CuentaBancaria.moneda DEBE coincidir con
// cuenta.monedaFuncional.
export class CuentaBancariaMonedaIncompatibleError extends InvalidStateError {
  constructor(monedaSolicitada: string, monedaFuncional: string) {
    super(
      'CONCILIACION_MONEDA_INCOMPATIBLE',
      `La cuenta del plan solo admite ${monedaFuncional} y no permite multi-moneda`,
      { monedaSolicitada, monedaFuncional },
    );
  }
}
