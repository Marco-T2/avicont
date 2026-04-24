/**
 * Errores de dominio del módulo `users`. Subclases de DomainError que
 * el GlobalExceptionFilter mapea al formato estándar de respuesta
 * (CLAUDE.md §6.4).
 *
 * Los `code` son IDs ESTABLES hacia el cliente — una vez publicados no
 * cambian aunque el `message` evolucione (CLAUDE.md §6.3).
 */

import { ConflictError, NotFoundError, ValidationError } from '@/common/errors';

// ============================================================
// 404 — recurso no existente
// ============================================================

export class UsuarioNoEncontradoError extends NotFoundError {
  constructor(id: string) {
    super('USER_NO_ENCONTRADO', 'El usuario no existe', { id });
  }
}

// ============================================================
// 409 — conflictos de unicidad
// ============================================================

export class UsuarioEmailDuplicadoError extends ConflictError {
  constructor(email: string) {
    super(
      'USER_EMAIL_DUPLICADO',
      `Ya existe un usuario con el email "${email}"`,
      { email },
    );
  }
}

// ============================================================
// 400 — VOs con input inválido
// ============================================================

export class EmailInvalidoError extends ValidationError {
  constructor(raw: unknown, motivo: string) {
    super('USER_EMAIL_INVALIDO', `Email inválido: ${motivo}`, { raw });
  }
}

export class UserIdInvalidoError extends ValidationError {
  constructor(raw: unknown) {
    super(
      'USER_ID_INVALIDO',
      'UserId inválido: se esperaba un UUID',
      { raw },
    );
  }
}

export class DisplayNameInvalidoError extends ValidationError {
  constructor(motivo: string, details?: Record<string, unknown>) {
    super('USER_DISPLAY_NAME_INVALIDO', `DisplayName inválido: ${motivo}`, details);
  }
}
