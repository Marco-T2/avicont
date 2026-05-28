import { useHasSystemRole } from '@/lib/use-permissions';

/**
 * Deducción client-side pragmática (proposal Q1 cerrado).
 *
 * Devuelve `true` si el usuario actual tiene SystemRole OWNER o ADMIN.
 * El backend hace el mismo short-circuit y es la autoridad real.
 *
 * LÍMITE CONOCIDO — CustomRoles: no podemos deducir si un CustomRole tiene
 * el claim `contabilidad.asientos.edit-posted` sin un endpoint
 * `GET /api/me/permissions` (fuera de scope en slice 1). El botón "Editar"
 * se muestra igual para CustomRoles; si el backend rechaza con 403 y código
 * `MISSING_PERMISSION_EDIT_POSTED`, `mensajeComprobantes()` traduce el error
 * a un toast claro. Ver design §Permission gating.
 */
export function usePuedeEditarContabilizado(): boolean {
  return useHasSystemRole(['OWNER', 'ADMIN']);
}
