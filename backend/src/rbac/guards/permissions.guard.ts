import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RbacService } from '../rbac.service';
import { PERMISSIONS_KEY } from '../decorators/require-permissions.decorator';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly rbacService: RbacService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!required || required.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user as
      | { sub?: string; activeTenantId?: string; isSuperAdmin?: boolean }
      | undefined;
    if (!user?.sub) {
      throw new UnauthorizedException('No autenticado');
    }

    // Super-admin de plataforma: corto-circuita el matcher de permisos por-org.
    // El flag viene del JWT (req.user), NO del cache RBAC por-org. Coherente con
    // el short-circuit esOwner/esAdmin del resolver, pero a nivel de identidad de
    // plataforma (docs/disenos/super-admin-plataforma.md §4.3).
    // Comparación estricta === true: un valor truthy NO activa el short-circuit.
    if (user.isSuperAdmin === true) return true;

    // tenantId puede venir del JWT (caso normal) o del header X-Tenant-ID
    // (caso super-admin con impersonation, validado en otro guard).
    const tenantId = (request.headers['x-tenant-id'] as string | undefined) || user.activeTenantId;
    if (!tenantId) {
      throw new ForbiddenException('Se requiere contexto de organización');
    }

    const allowed = await this.rbacService.hasAllPermissions(user.sub, tenantId, required);
    if (!allowed) {
      throw new ForbiddenException('Permisos insuficientes');
    }
    return true;
  }
}
