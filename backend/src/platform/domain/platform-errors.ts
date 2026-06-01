/**
 * Errores de dominio del módulo `platform`. Subclases de DomainError que
 * el GlobalExceptionFilter mapea al formato estándar de respuesta
 * (CLAUDE.md §6.4).
 *
 * Los `code` son IDs ESTABLES hacia el cliente — una vez publicados no
 * cambian aunque el `message` evolucione (CLAUDE.md §6.3).
 */

import { InvalidStateError } from '@/common/errors';

/**
 * El email del OWNER designado no existe en el sistema.
 * Se lanza cuando el super-admin crea una org y el ownerEmail no corresponde
 * a ningún usuario registrado (REQ-SA-13).
 * HTTP 422: el estado del input es semánticamente inválido (el email tiene
 * formato correcto pero no hay usuario con ese email).
 */
export class PlatformOrgOwnerNotFoundError extends InvalidStateError {
  constructor(ownerEmail: string) {
    super(
      'PLATFORM_ORG_OWNER_NOT_FOUND',
      `No existe ningún usuario registrado con el email: ${ownerEmail}`,
      { ownerEmail },
    );
  }
}
