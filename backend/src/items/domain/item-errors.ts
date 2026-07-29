/**
 * Errores de dominio del módulo `items`. Subclases de `DomainError` que el
 * GlobalExceptionFilter mapea al formato estándar (CLAUDE.md §6.4).
 *
 * Los `code` son IDs ESTABLES hacia el cliente (§6.3).
 */

import { ConflictError, NotFoundError } from '@/common/errors';

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
