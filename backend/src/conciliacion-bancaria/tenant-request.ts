import { ForbiddenError } from '@/common/errors';

// Mismo resolver que el resto de controllers del proyecto
// (tipos-documento-fisico, comprobantes): el header `X-Tenant-ID` lo usa
// super-admin; para el resto vale `activeTenantId` del JWT (§5.4 core).
//
// Vive en un archivo propio del módulo para que los 3 controllers de
// conciliación compartan UNA sola implementación — si divergieran, la
// resolución de tenant dejaría de ser uniforme, que es exactamente el tipo de
// grieta que Anti-31 vigila.

export interface AuthenticatedRequest {
  user: { sub: string; activeTenantId?: string };
  headers: Record<string, string | string[] | undefined>;
}

export function resolveTenantId(req: AuthenticatedRequest): string {
  const fromHeader = req.headers['x-tenant-id'];
  const tenantId =
    (Array.isArray(fromHeader) ? fromHeader[0] : fromHeader) || req.user.activeTenantId;
  if (tenantId === undefined || tenantId === '') {
    throw new ForbiddenError('TENANT_CONTEXT_REQUIRED', 'Se requiere contexto de organización');
  }
  return tenantId;
}
