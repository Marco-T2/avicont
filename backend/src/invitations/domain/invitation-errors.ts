/**
 * Errores de dominio del módulo `invitations`. Subclases de DomainError que
 * el GlobalExceptionFilter mapea al formato estándar de respuesta
 * (CLAUDE.md §6.4).
 *
 * Los `code` son IDs ESTABLES hacia el cliente — una vez publicados no
 * cambian aunque el `message` evolucione (CLAUDE.md §6.3).
 */

import { ForbiddenError } from '@/common/errors';

// ============================================================
// 403 — reglas de negocio que bloquean la acción
// ============================================================

/**
 * Un invitador sin rol OWNER intentó crear una invitación asignando systemRole OWNER.
 * Solo un OWNER puede invitar a otro OWNER (escalada de privilegios).
 */
export class InvitacionAsignacionOwnerNoPermitidaError extends ForbiddenError {
  constructor() {
    super(
      'INVITACION_ASIGNACION_OWNER_NO_PERMITIDA',
      'Solo un OWNER puede invitar a alguien como OWNER',
    );
  }
}
