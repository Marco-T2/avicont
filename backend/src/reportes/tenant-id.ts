import { ForbiddenError } from '@/common/errors';

/**
 * Interfaz mínima del request autenticado que expone el tenant activo.
 * Reutilizada por ReportesController y EeffController.
 */
export interface AuthenticatedRequest {
  user: { sub: string; activeTenantId?: string };
  headers: Record<string, string | string[] | undefined>;
}

/**
 * Resuelve el tenantId desde el JWT del request.
 *
 * Fuente de tenantId: JWT.activeTenantId (CLAUDE.md §5.4).
 * Header `X-Tenant-ID` solo para super-admin — se acepta aquí siguiendo
 * el mismo patrón que ReportesController y ComprobantesController.
 *
 * Defense in depth (§4.2): lanzar si no hay tenantId (nunca confiar
 * en que el guard ya verificó).
 */
export function resolveTenantId(req: AuthenticatedRequest): string {
  const fromHeader = req.headers['x-tenant-id'];
  const tenantId =
    (Array.isArray(fromHeader) ? fromHeader[0] : fromHeader) || req.user.activeTenantId;
  if (tenantId === undefined || tenantId === '') {
    throw new ForbiddenError('TENANT_CONTEXT_REQUIRED', 'Se requiere contexto de organización');
  }
  return tenantId;
}
