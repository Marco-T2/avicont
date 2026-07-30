import { ForbiddenError } from '@/common/errors';

// Mismo resolver que el resto de controllers del proyecto (ventas,
// conciliacion-bancaria): el header `X-Tenant-ID` lo usa super-admin; para el
// resto vale `activeTenantId` del JWT (§5.4 core).
//
// Vive en un archivo propio del módulo para que los 2 controllers de
// cuentas-por-cobrar compartan UNA sola implementación (precedente:
// `conciliacion-bancaria/tenant-request.ts`).

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
