import { usePermissions } from '@/lib/use-permissions';

interface CanProps {
  /**
   * Permiso requerido para mostrar el contenido.
   * - `string` → un permiso.
   * - `string[]` → AND de todos (espeja `@RequirePermissions('a','b')` del backend).
   */
  permission: string | string[];
  /**
   * Si children es función, se llama con `allowed: boolean` — patrón render-prop
   * útil para el caso deshabilitar (visible pero inerte):
   *
   * @example
   * <Can permission={PERMISSIONS.contabilidad.asientos.post}>
   *   {(allowed) => (
   *     <Tooltip>
   *       <TooltipTrigger asChild>
   *         <span><Button disabled={!allowed}>Contabilizar</Button></span>
   *       </TooltipTrigger>
   *       {!allowed && <TooltipContent>No tenés permiso</TooltipContent>}
   *     </Tooltip>
   *   )}
   * </Can>
   */
  children: React.ReactNode | ((allowed: boolean) => React.ReactNode);
  /** Nodo a renderizar cuando no tiene permiso. Default: null (ocultar). */
  fallback?: React.ReactNode;
}

/**
 * Componente declarativo de gating UX.
 *
 * - Sin permiso → no renderiza children (o renderiza fallback).
 * - Con render-prop → siempre llama children(allowed) sin ocultar.
 * - En loading → has() devuelve false (fail-closed — evita flash).
 *
 * La autoridad real sigue siendo el backend (CLAUDE.md §5 defense in depth).
 * Este componente es solo UX: no muestra acciones que darían 403.
 */
export function Can({ permission, children, fallback = null }: CanProps): React.JSX.Element {
  const { has, hasAll } = usePermissions();
  const allowed = Array.isArray(permission) ? hasAll(permission) : has(permission);

  if (typeof children === 'function') {
    return <>{children(allowed)}</>;
  }

  return allowed ? <>{children}</> : <>{fallback}</>;
}
