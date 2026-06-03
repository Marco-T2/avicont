/**
 * Errores de dominio del módulo `memberships`. Subclases de DomainError que
 * el GlobalExceptionFilter mapea al formato estándar de respuesta
 * (CLAUDE.md §6.4).
 *
 * Los `code` son IDs ESTABLES hacia el cliente — una vez publicados no
 * cambian aunque el `message` evolucione (CLAUDE.md §6.3).
 */

import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '@/common/errors';

// ============================================================
// 404 — recursos no existentes
// ============================================================

export class MembershipNoEncontradoError extends NotFoundError {
  constructor(membershipId: string) {
    super('MEMBERSHIP_NO_ENCONTRADO', 'La membership no existe en este tenant', {
      membershipId,
    });
  }
}

/**
 * Invite a un email que no está registrado como User. La política actual es
 * que el usuario debe crear cuenta primero; el flujo de onboarding para
 * terceros vive en `invitations`.
 */
export class UsuarioNoRegistradoParaInviteError extends NotFoundError {
  constructor(email: string) {
    super(
      'MEMBERSHIP_USUARIO_NO_REGISTRADO',
      'El usuario a invitar no está registrado. Debe crear cuenta primero.',
      { email },
    );
  }
}

// ============================================================
// 409 — conflictos de estado
// ============================================================

export class UsuarioYaEsMiembroError extends ConflictError {
  constructor(email: string, tenantId: string) {
    super('MEMBERSHIP_USUARIO_YA_ES_MIEMBRO', 'El usuario ya es miembro de esta organización', {
      email,
      tenantId,
    });
  }
}

// ============================================================
// 403 — reglas de negocio que bloquean la acción
// ============================================================

/**
 * Demotion/remove del último OWNER del tenant: rompería la invariante
 * "toda organización tiene al menos un OWNER activo". El admin debe
 * transferir ownership primero.
 */
export class UltimoOwnerError extends ForbiddenError {
  constructor(tenantId: string) {
    super(
      'MEMBERSHIP_ULTIMO_OWNER',
      'No se puede eliminar o degradar al último OWNER. Transferir ownership primero.',
      { tenantId },
    );
  }
}

/**
 * El actor intenta degradarse a sí mismo desde OWNER. Para dejar de ser OWNER
 * primero hay que transferir el rol a otra membership.
 */
export class AutoDegradacionOwnerError extends ForbiddenError {
  constructor(userId: string) {
    super('MEMBERSHIP_AUTO_DEGRADACION_OWNER', 'No puede cambiar su propio rol de OWNER', {
      userId,
    });
  }
}

// ============================================================
// 400 — VOs con input inválido
// ============================================================

export class MembershipIdInvalidoError extends ValidationError {
  constructor(raw: unknown) {
    super('MEMBERSHIP_ID_INVALIDO', 'MembershipId inválido: se esperaba un UUID', { raw });
  }
}

export class AsignacionRolInvalidaError extends ValidationError {
  constructor(motivo: string) {
    super('MEMBERSHIP_ASIGNACION_ROL_INVALIDA', `Asignación de rol inválida: ${motivo}`);
  }
}

/**
 * El `customRoleId` no existe o pertenece a otro tenant. No discriminamos
 * los dos casos al cliente para no filtrar IDs cross-tenant.
 */
export class CustomRoleInvalidoParaTenantError extends ValidationError {
  constructor(customRoleId: string, tenantId: string) {
    super('MEMBERSHIP_CUSTOM_ROLE_INVALIDO', 'El customRoleId es inválido para esta organización', {
      customRoleId,
      tenantId,
    });
  }
}
