import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { TenantContextService } from '../tenant-context/tenant-context.service';
import { PrismaService } from '../prisma.service';

@Injectable()
export class TenantGuard implements CanActivate {
  constructor(
    private readonly tenantContext: TenantContextService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    // Los guards corren ANTES de los interceptors, así que NO podemos depender
    // de req.tenantId (lo setea TenantContextInterceptor) ni de
    // tenantContext.getTenantId() (AsyncLocalStorage). Leemos directo del
    // header X-Tenant-ID o del JWT.activeTenantId.
    const headerTenantId = req.headers['x-tenant-id'] as string | undefined;
    const user = req.user as
      | { sub?: string; activeTenantId?: string; isSuperAdmin?: boolean }
      | undefined;
    const tenantId = headerTenantId || user?.activeTenantId;
    if (!tenantId) {
      throw new ForbiddenException('Tenant context is required');
    }

    // Setear req.tenantId acá facilita el resto del pipeline (controllers leen
    // de req.tenantId vía @CurrentTenant; interceptor lo confirma después).
    req.tenantId = tenantId;

    // Bypass disciplinado de membresía para super-admin de plataforma.
    // (docs/disenos/super-admin-plataforma.md §4.3)
    // Relaja SOLO la exigencia de Membership: el filtro WHERE organizationId
    // del repositorio sigue scoped a este tenantId concreto. Comparación
    // estricta === true: un valor truthy (ej: 1) NO activa el bypass.
    if (user?.isSuperAdmin === true) return true;

    if (user?.sub) {
      const membership = await this.prisma.membership.findUnique({
        where: {
          organizationId_userId: {
            organizationId: tenantId,
            userId: user.sub,
          },
        },
      });

      if (!membership || membership.deactivatedAt) {
        throw new ForbiddenException('You are not a member of this tenant');
      }
    }

    return true;
  }
}
