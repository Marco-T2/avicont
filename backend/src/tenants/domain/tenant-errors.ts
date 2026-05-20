/**
 * Errores de dominio del módulo `tenants`. Subclases de DomainError que
 * el GlobalExceptionFilter mapea al formato estándar de respuesta
 * (CLAUDE.md §6.4).
 *
 * Los `code` son IDs ESTABLES hacia el cliente — una vez publicados no
 * cambian aunque el `message` evolucione (CLAUDE.md §6.3).
 */

import { ConflictError, NotFoundError, ValidationError } from '@/common/errors';

// ============================================================
// 404 — recursos no existentes
// ============================================================

export class TenantNoEncontradoError extends NotFoundError {
  constructor(detalle: { id: string } | { slug: string }) {
    super('TENANT_NO_ENCONTRADO', 'La organización no existe', detalle);
  }
}

// ============================================================
// 409 — conflictos de estado
// ============================================================

export class TenantSlugDuplicadoError extends ConflictError {
  constructor(slug: string) {
    super('TENANT_SLUG_DUPLICADO', 'Ya existe una organización con ese identificador', { slug });
  }
}

/**
 * El `tipoEmpresaPrincipal` no se puede cambiar porque ya existe una
 * gestión fiscal — el cierre fiscal está derivado del tipo de empresa
 * (Ley 843 art. 46) y cambiar el tipo invalidaría la gestión existente.
 * Ver `docs/disenos/gestiones-periodos-fiscales-v3.md` §2.1.
 *
 * El code `TENANT_EMPRESA_INMUTABLE` se mantiene estable desde la
 * implementación previa para no romper clientes que lo discriminen.
 */
export class TipoEmpresaInmutableError extends ConflictError {
  constructor(tenantId: string) {
    super(
      'TENANT_EMPRESA_INMUTABLE',
      'El tipo de empresa no se puede cambiar porque ya existe una gestión fiscal. Elimine o cierre las gestiones primero.',
      { tenantId },
    );
  }
}

// ============================================================
// 400 — VOs con input inválido
// ============================================================

export class OrganizationIdInvalidoError extends ValidationError {
  constructor(raw: unknown) {
    super('TENANT_ID_INVALIDO', 'OrganizationId inválido: se esperaba un UUID', {
      raw,
    });
  }
}

export class TenantSlugInvalidoError extends ValidationError {
  constructor(motivo: string, detalle?: Record<string, unknown>) {
    super('TENANT_SLUG_INVALIDO', `Slug de organización inválido: ${motivo}`, detalle);
  }
}
