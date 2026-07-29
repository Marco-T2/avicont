/**
 * Errores de dominio del módulo `items`. Subclases de `DomainError` que el
 * GlobalExceptionFilter mapea al formato estándar (CLAUDE.md §6.4).
 *
 * Los `code` son IDs ESTABLES hacia el cliente (§6.3).
 */

import { ConflictError, NotFoundError, ValidationError } from '@/common/errors';

export class ItemNoEncontradoError extends NotFoundError {
  constructor(id: string) {
    super('ITEM_NO_ENCONTRADO', 'El ítem no existe', { id });
  }
}

/**
 * Enforcement SIMULTÁNEO con el UNIQUE PARCIAL de Postgres (Anti-23,
 * cicatriz F-01): solo-servicio falla bajo concurrencia, solo-constraint da
 * un 500 críptico. Este error es la mitad amigable.
 *
 * `itemExistenteId` es opcional porque hay dos caminos: el pre-check del
 * service (que conoce al ocupante) y el rescate del P2002 en el adapter,
 * que no re-consulta para ahorrar la query.
 */
export class ItemCodigoDuplicadoError extends ConflictError {
  constructor(codigo: string, itemExistenteId?: string) {
    super(
      'ITEM_CODIGO_DUPLICADO',
      `Ya existe un ítem con el código "${codigo}" en esta organización`,
      itemExistenteId !== undefined ? { codigo, itemExistenteId } : { codigo },
    );
  }
}

/**
 * La cuenta de ingreso asignada al ítem no sirve como destino del asiento de
 * venta: no existe en el tenant, no es de detalle, o está inactiva.
 *
 * El chequeo de tenant NO es redundante con la FK: las dos filas viven en
 * `cuentas`, así que Postgres aceptaría feliz el id de otra organización —
 * y eso es la violación de §4.2 que la constitución llama bug de seguridad.
 *
 * Este código no figura en la tabla de errores de la spec de items (que sólo
 * lista `ITEM_CODIGO_DUPLICADO` y `CUENTA_REFERENCIADA_POR_ITEMS`). Se agrega
 * porque la alternativa era aceptar el id en silencio y que la venta
 * explotara mucho después, al generar el asiento, con un error que no nombra
 * la causa.
 */
export class ItemCuentaIngresoInvalidaError extends ValidationError {
  constructor(cuentaIngresoId: string, motivo: 'NO_ENCONTRADA' | 'NO_ES_DETALLE' | 'INACTIVA') {
    super(
      'ITEM_CUENTA_INGRESO_INVALIDA',
      {
        NO_ENCONTRADA: 'La cuenta de ingreso no existe en esta organización',
        NO_ES_DETALLE: 'La cuenta de ingreso debe ser una cuenta de detalle',
        INACTIVA: 'La cuenta de ingreso está inactiva',
      }[motivo],
      { cuentaIngresoId, motivo },
    );
  }
}
