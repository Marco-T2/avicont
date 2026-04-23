// Matcher de permisos con wildcards.
// Patrones permitidos (ver CLAUDE.md §10.4 y decisión 2 de Fase 0.6):
//   *                          → comodín total (solo OWNER/ADMIN)
//   modulo.*                   → todo el módulo
//   modulo.submodulo.*         → todas las acciones del submódulo
//   modulo.*.accion            → la acción en cualquier submódulo del módulo
//   modulo.submodulo.accion    → exacto
// Prohibidos: *.accion, *.*.accion, multiples wildcards.

const WILDCARD = '*';

export class InvalidPermissionPatternError extends Error {
  constructor(pattern: string, reason: string) {
    super(`Patrón de permiso inválido "${pattern}": ${reason}`);
    this.name = 'InvalidPermissionPatternError';
  }
}

// Valida que un string sea un patrón aceptable. Útil para custom roles.
export function assertValidPermissionPattern(pattern: string): void {
  if (!pattern || typeof pattern !== 'string') {
    throw new InvalidPermissionPatternError(pattern, 'debe ser string no vacío');
  }
  if (pattern === WILDCARD) return;

  const segments = pattern.split('.');
  if (segments.length < 2 || segments.length > 3) {
    throw new InvalidPermissionPatternError(pattern, 'debe tener formato modulo.submodulo[.accion]');
  }
  for (const seg of segments) {
    if (!seg) {
      throw new InvalidPermissionPatternError(pattern, 'segmento vacío entre puntos');
    }
  }

  const wildcardCount = segments.filter((s) => s === WILDCARD).length;
  if (wildcardCount > 1) {
    throw new InvalidPermissionPatternError(pattern, 'solo se permite un wildcard');
  }

  // Prohibido: el primer segmento (modulo) NO puede ser wildcard a menos que
  // el patrón sea exactamente "*" (cubierto arriba).
  if (segments[0] === WILDCARD) {
    throw new InvalidPermissionPatternError(
      pattern,
      'modulo no puede ser wildcard (usar "*" solo, sin sufijos)',
    );
  }
}

// Verifica si un patrón otorgado matchea con un permiso requerido.
// El patrón otorgado puede tener wildcards; el permiso requerido es siempre exacto.
export function matchesPermission(granted: string, required: string): boolean {
  if (granted === WILDCARD) return true;

  const grantedParts = granted.split('.');
  const requiredParts = required.split('.');

  if (grantedParts.length !== requiredParts.length) return false;

  for (let i = 0; i < grantedParts.length; i++) {
    const g = grantedParts[i];
    const r = requiredParts[i];
    if (g === WILDCARD) continue;
    if (g !== r) return false;
  }
  return true;
}

// Verifica si un conjunto de permisos otorgados cubre TODOS los requeridos.
export function hasAllPermissions(granted: string[], required: string[]): boolean {
  if (required.length === 0) return true;
  return required.every((req) => granted.some((g) => matchesPermission(g, req)));
}

// Verifica si un conjunto de permisos otorgados cubre AL MENOS UN requerido.
export function hasAnyPermission(granted: string[], required: string[]): boolean {
  if (required.length === 0) return true;
  return required.some((req) => granted.some((g) => matchesPermission(g, req)));
}
