/**
 * Errores de dominio del módulo `platform`. Subclases de DomainError que
 * el GlobalExceptionFilter mapea al formato estándar de respuesta
 * (CLAUDE.md §6.4).
 *
 * Los `code` son IDs ESTABLES hacia el cliente — una vez publicados no
 * cambian aunque el `message` evolucione (CLAUDE.md §6.3).
 */

import { InvalidStateError, NotFoundError } from '@/common/errors';

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

/**
 * La organización que se intenta actualizar no existe en la plataforma.
 * Se lanza desde los endpoints PATCH /status y PATCH /entitlement cuando
 * el `:id` del path no corresponde a ninguna organización (REQ-SA-14/15).
 */
export class PlatformOrgNoEncontradaError extends NotFoundError {
  constructor(orgId: string) {
    super('PLATFORM_ORG_NO_ENCONTRADA', 'La organización no existe en la plataforma', { orgId });
  }
}

/**
 * Un PATCH /entitlement intentó activar ambos verticales simultáneamente.
 * Una org solo puede tener UN vertical activo (Contabilidad O Granja).
 * Defense in depth con el CHECK constraint `organizations_vertical_exclusivo_check`
 * de la BD (CLAUDE.md §4.8, §10.4 docs/disenos/plataforma-multi-vertical.md).
 */
export class PlatformVerticalNoExclusivoError extends InvalidStateError {
  constructor(orgId: string) {
    super(
      'PLATFORM_VERTICAL_NO_EXCLUSIVO',
      'Una organización no puede tener más de un vertical activo a la vez (Contabilidad o Granja, no ambos)',
      { orgId },
    );
  }
}
