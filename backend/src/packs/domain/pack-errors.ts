/**
 * Errores de dominio del módulo `packs`. Subclases de DomainError que el
 * GlobalExceptionFilter mapea al formato estándar de respuesta (CLAUDE.md §6.4).
 *
 * Los `code` son IDs ESTABLES hacia el cliente — una vez publicados no cambian
 * aunque el `message` evolucione (CLAUDE.md §6.3).
 */

import { ForbiddenError, NotFoundError, ValidationError } from '@/common/errors';

// ============================================================
// 403 — frontera activación ⊆ entitlement
// ============================================================

/**
 * El Owner intenta activar (o el guard chequea) un pack que la plataforma no
 * habilitó para su organización. Frontera de oro (§4.5 diseño): la activación
 * es siempre un subconjunto del entitlement. HTTP 403.
 */
export class PackNoHabilitadoError extends ForbiddenError {
  constructor(clave: string) {
    super('PACK_NO_HABILITADO', 'Este pack no está habilitado para tu organización', { clave });
  }
}

// ============================================================
// 404 — recurso del catálogo no existe
// ============================================================

/** El pack no existe en el catálogo global. HTTP 404. */
export class PackNoEncontradoError extends NotFoundError {
  constructor(detalle: { id: string } | { clave: string }) {
    super('PACK_NO_ENCONTRADO', 'El pack no existe en el catálogo', detalle);
  }
}

// ============================================================
// 400 — vertical incompatible
// ============================================================

/**
 * Intento de habilitar un pack cuyo `verticalAplicable` no coincide con el
 * vertical de la organización. Protege la exclusividad de vertical (§10.4 core)
 * y la regla de interacción packs↔vertical (§8 diseño). HTTP 400.
 */
export class PackVerticalNoAplicableError extends ValidationError {
  constructor(detalle: { packClave: string; verticalPack: string; verticalOrg: string }) {
    super(
      'PACK_VERTICAL_NO_APLICABLE',
      'El pack no aplica al vertical de la organización',
      detalle,
    );
  }
}
