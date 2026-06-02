/**
 * Errores de dominio del módulo `custom-roles`. Subclases de DomainError
 * mapeadas por el GlobalExceptionFilter al formato estándar (CLAUDE.md §6.4).
 * Los `code` son IDs ESTABLES hacia el cliente (CLAUDE.md §6.3).
 */

import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '@/common/errors';

// ============================================================
// 404
// ============================================================

export class CustomRoleNoEncontradoError extends NotFoundError {
  constructor(customRoleId: string) {
    super('CUSTOM_ROLE_NO_ENCONTRADO', 'El rol personalizado no existe en esta organización', {
      customRoleId,
    });
  }
}

// ============================================================
// 409
// ============================================================

export class CustomRoleSlugDuplicadoError extends ConflictError {
  constructor(slug: string, tenantId: string) {
    super(
      'CUSTOM_ROLE_SLUG_DUPLICADO',
      `Ya existe un rol con slug "${slug}" en esta organización`,
      { slug, tenantId },
    );
  }
}

export class CustomRoleConMiembrosActivosError extends ConflictError {
  constructor(customRoleId: string, activos: number) {
    super(
      'CUSTOM_ROLE_CON_MIEMBROS_ACTIVOS',
      `No se puede eliminar: ${activos} miembro(s) activo(s) tienen este rol`,
      { customRoleId, activos },
    );
  }
}

// ============================================================
// 403
// ============================================================

export class CustomRoleNoEditableError extends ForbiddenError {
  constructor(customRoleId: string) {
    super('CUSTOM_ROLE_NO_EDITABLE', 'Este rol está marcado como no editable', { customRoleId });
  }
}

export class CustomRoleDelSistemaError extends ForbiddenError {
  constructor(customRoleId: string) {
    super('CUSTOM_ROLE_DEL_SISTEMA', 'No se pueden eliminar roles del sistema', { customRoleId });
  }
}

// ============================================================
// 400 — VOs con input inválido
// ============================================================

export class CustomRoleIdInvalidoError extends ValidationError {
  constructor(raw: unknown) {
    super('CUSTOM_ROLE_ID_INVALIDO', 'CustomRoleId inválido: se esperaba un UUID', { raw });
  }
}

export class CustomRoleSlugInvalidoError extends ValidationError {
  constructor(motivo: string, details?: Record<string, unknown>) {
    super('CUSTOM_ROLE_SLUG_INVALIDO', `Slug inválido: ${motivo}`, details);
  }
}

// ============================================================
// 400 — permisos
// ============================================================

/**
 * El patrón de permiso tiene sintaxis inválida (no pasa
 * `assertValidPermissionPattern` de `rbac/domain`). Ej: `"contabilidad..read"`,
 * `"contabilidad.*.*"` mal formado.
 */
export class PermisoInvalidoError extends ValidationError {
  constructor(permiso: string, motivo: string) {
    super('CUSTOM_ROLE_PERMISO_INVALIDO', `Permiso inválido "${permiso}": ${motivo}`, { permiso });
  }
}

/**
 * El permiso tiene formato válido y es exacto (sin wildcards) pero no
 * existe en el catálogo. Wildcards se aceptan sin chequear el catálogo
 * porque pueden cubrir permisos futuros.
 */
export class PermisoDesconocidoError extends ValidationError {
  constructor(permiso: string) {
    super('CUSTOM_ROLE_PERMISO_DESCONOCIDO', `Permiso desconocido: "${permiso}"`, { permiso });
  }
}

/**
 * El permiso existe en el catálogo pero NO es asignable en esta org: pertenece
 * a otro vertical, o a un submódulo de un pack que la org no tiene activo
 * (eje 2, cierre de la deuda RBAC — docs/disenos/packs-eje2.md §7). Es el
 * candado server-authoritative que respalda el filtrado del catálogo asignable.
 */
export class PermisoNoHabilitadoError extends ValidationError {
  constructor(permiso: string) {
    super(
      'CUSTOM_ROLE_PERMISO_NO_HABILITADO',
      `El permiso "${permiso}" no está habilitado para esta organización (vertical o pack no activo)`,
      { permiso },
    );
  }
}
