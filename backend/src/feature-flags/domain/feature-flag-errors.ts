/**
 * Errores de dominio del módulo `feature-flags`. Subclases de DomainError que
 * el GlobalExceptionFilter mapea al formato estándar de respuesta
 * (CLAUDE.md §6.4).
 *
 * Los `code` son IDs ESTABLES hacia el cliente — una vez publicados no
 * cambian aunque el `message` evolucione (CLAUDE.md §6.3).
 */

import { ConflictError, NotFoundError, ValidationError } from '@/common/errors';

// ============================================================
// 400 — VOs con input inválido
// ============================================================

export class FeatureFlagKeyInvalidaError extends ValidationError {
  constructor(raw: unknown, motivo: string) {
    super('FEATURE_FLAG_KEY_INVALIDA', `Feature flag key inválida: ${motivo}`, { raw });
  }
}

// ============================================================
// 404 — recurso no existente
// ============================================================

export class FeatureFlagNoEncontradaError extends NotFoundError {
  constructor(key: string, organizationId: string | null) {
    super(
      'FEATURE_FLAG_NO_ENCONTRADA',
      organizationId
        ? `La feature flag "${key}" no existe para la organización`
        : `La feature flag global "${key}" no existe`,
      { key, organizationId },
    );
  }
}

// ============================================================
// 409 — conflictos de unicidad
// ============================================================

export class FeatureFlagDuplicadaError extends ConflictError {
  constructor(key: string, organizationId: string | null) {
    super(
      'FEATURE_FLAG_DUPLICADA',
      organizationId
        ? `Ya existe una feature flag "${key}" para la organización`
        : `Ya existe una feature flag global "${key}"`,
      { key, organizationId },
    );
  }
}
