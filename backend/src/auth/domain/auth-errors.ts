/**
 * Errores de dominio del módulo `auth`. Subclases de DomainError que el
 * GlobalExceptionFilter mapea al formato estándar de respuesta (CLAUDE.md
 * §6.4). Los `code` son IDs ESTABLES hacia el cliente (CLAUDE.md §6.3).
 */

import { UnauthorizedError, ValidationError } from '@/common/errors';

// ============================================================
// 401 — credenciales / tokens
// ============================================================

/**
 * Credenciales inválidas en login: email no existe, password no matchea, o
 * usuario desactivado. El mensaje es genérico a propósito — nunca discriminar
 * para no filtrar estado al atacante (CLAUDE.md §5.2).
 */
export class CredencialesInvalidasError extends UnauthorizedError {
  constructor() {
    super('AUTH_CREDENCIALES_INVALIDAS', 'Credenciales inválidas');
  }
}

/**
 * Refresh token no encontrado, revocado o expirado. Único error para los tres
 * casos: no discriminar al cliente (CLAUDE.md §5.3).
 */
export class TokenInvalidoError extends UnauthorizedError {
  constructor() {
    super('AUTH_TOKEN_INVALIDO', 'Token inválido o expirado');
  }
}

/**
 * Switch-tenant a una organización en la que el usuario no tiene membership
 * activa.
 */
export class NoMiembroDeTenantError extends UnauthorizedError {
  constructor(tenantId: string) {
    super('AUTH_NO_MIEMBRO_DE_TENANT', 'El usuario no es miembro activo del tenant solicitado', {
      tenantId,
    });
  }
}

// ============================================================
// 400 — VOs con input inválido
// ============================================================

export class RefreshTokenHashInvalidoError extends ValidationError {
  constructor(motivo: string) {
    super('AUTH_REFRESH_TOKEN_HASH_INVALIDO', `Hash de refresh token inválido: ${motivo}`);
  }
}

export class TokenFamilyInvalidaError extends ValidationError {
  constructor(motivo: string) {
    super('AUTH_TOKEN_FAMILY_INVALIDA', `TokenFamily inválida: ${motivo}`);
  }
}

export class JwtClaimsInvalidosError extends ValidationError {
  constructor(motivo: string) {
    super('AUTH_CLAIMS_INVALIDOS', `Claims de JWT inválidos: ${motivo}`);
  }
}
