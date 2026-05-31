// Porteo del matcher de wildcards del backend
// (backend/src/rbac/domain/permission-matcher.ts).
// Función pura, sin efectos, sin deps de React.
//
// Patrones soportados (coherente con el backend):
//   *                       → comodín total (OWNER/ADMIN)
//   modulo.*                → todo el módulo
//   modulo.submodulo.*      → todas las acciones del submódulo
//   modulo.submodulo.accion → exacto
//
// IMPORTANTE: `permissions` del endpoint /me/permissions son patrones
// (wildcards), NO la lista expandida. El hook DEBE usar este matcher,
// NO Array.includes(), o el gating de no-owners fallará silencioso.

const WILDCARD = '*';

/**
 * Verifica si un patrón otorgado (con posibles wildcards) cubre un permiso
 * requerido (siempre exacto, sin wildcards).
 *
 * @param granted - Patrón del usuario, ej. "contabilidad.*"
 * @param required - Permiso exacto, ej. "contabilidad.eeff.read"
 */
export function matchesPermission(granted: string, required: string): boolean {
  if (granted === WILDCARD) return true;

  const grantedParts = granted.split('.');
  const requiredParts = required.split('.');

  if (grantedParts.length !== requiredParts.length) return false;

  for (let i = 0; i < grantedParts.length; i++) {
    const g = grantedParts[i];
    const r = requiredParts[i];
    if (g === undefined || r === undefined) return false;
    if (g === WILDCARD) continue;
    if (g !== r) return false;
  }
  return true;
}
