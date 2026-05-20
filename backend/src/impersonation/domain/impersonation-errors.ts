/**
 * Errores de dominio del módulo `impersonation`. Subclases de DomainError
 * mapeadas por el GlobalExceptionFilter al formato estándar (CLAUDE.md §6.4).
 * Los `code` son IDs ESTABLES hacia el cliente (CLAUDE.md §6.3).
 */

import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from '@/common/errors';

// ============================================================
// 404
// ============================================================

export class TargetNoMiembroError extends NotFoundError {
  constructor(targetUserId: string, tenantId: string) {
    super('IMPERSONATION_TARGET_NO_MIEMBRO', 'Target no es miembro de la organización', {
      targetUserId,
      tenantId,
    });
  }
}

export class SesionImpersonationNoEncontradaError extends NotFoundError {
  constructor(impersonationId: string) {
    super(
      'IMPERSONATION_SESION_NO_ENCONTRADA',
      'Sesión de impersonation no encontrada o ya cerrada',
      { impersonationId },
    );
  }
}

// ============================================================
// 409
// ============================================================

export class ImpersonationActivaExistenteError extends ConflictError {
  constructor(adminUserId: string) {
    super(
      'IMPERSONATION_ACTIVA_EXISTENTE',
      'Ya tenés una sesión de impersonation activa; cerrala antes de iniciar otra',
      { adminUserId },
    );
  }
}

// ============================================================
// 403
// ============================================================

export class SoloOwnerPuedeImpersonarError extends ForbiddenError {
  constructor(adminUserId: string, tenantId: string) {
    super(
      'IMPERSONATION_ONLY_OWNER_CAN',
      'Solo OWNER puede impersonar usuarios de la organización',
      { adminUserId, tenantId },
    );
  }
}

export class TargetEsOwnerError extends ForbiddenError {
  constructor(targetUserId: string) {
    super('IMPERSONATION_TARGET_ES_OWNER', 'No se puede impersonar a otro OWNER', { targetUserId });
  }
}

// ============================================================
// 401
// ============================================================

export class NoAutorizadoACerrarSesionError extends UnauthorizedError {
  constructor(impersonationId: string, callerUserId: string) {
    super('IMPERSONATION_NO_AUTORIZADO_A_CERRAR', 'No autorizado a cerrar esta sesión', {
      impersonationId,
      callerUserId,
    });
  }
}

// ============================================================
// 400 — reglas de negocio sobre el input del caller
// ============================================================

export class SelfImpersonationError extends ValidationError {
  constructor(userId: string) {
    super('IMPERSONATION_SELF_NO_PERMITIDA', 'No se puede impersonar a uno mismo', { userId });
  }
}

export class TargetMembershipDesactivadaError extends ValidationError {
  constructor(targetUserId: string, tenantId: string) {
    super('IMPERSONATION_TARGET_MEMBERSHIP_DESACTIVADA', 'Target está desactivado', {
      targetUserId,
      tenantId,
    });
  }
}

export class TargetConCuentaDesactivadaError extends ValidationError {
  constructor(targetUserId: string) {
    super('IMPERSONATION_TARGET_CUENTA_DESACTIVADA', 'Target tiene cuenta desactivada', {
      targetUserId,
    });
  }
}

// ============================================================
// 400 — VOs con input inválido
// ============================================================

export class ImpersonationIdInvalidoError extends ValidationError {
  constructor(raw: unknown) {
    super('IMPERSONATION_ID_INVALIDO', 'ImpersonationId inválido: se esperaba un UUID', { raw });
  }
}

export class ImpersonationReasonInvalidaError extends ValidationError {
  constructor(motivo: string, details?: Record<string, unknown>) {
    super('IMPERSONATION_REASON_INVALIDA', `Reason inválida: ${motivo}`, details);
  }
}

export class ImpersonationWindowInvalidaError extends ValidationError {
  constructor(motivo: string, details?: Record<string, unknown>) {
    super('IMPERSONATION_WINDOW_INVALIDA', `Ventana de impersonation inválida: ${motivo}`, details);
  }
}

export class ImpersonationJwtClaimsInvalidosError extends ValidationError {
  constructor(motivo: string) {
    super('IMPERSONATION_JWT_CLAIMS_INVALIDOS', `Claims de impersonation inválidos: ${motivo}`);
  }
}
