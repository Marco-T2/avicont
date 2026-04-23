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
    const user = request.user as { sub?: string; activeTenantId?: string } | undefined;
    if (!user?.sub) {
      throw new UnauthorizedException('No autenticado');
    }

    // tenantId puede venir del JWT (caso normal) o del header X-Tenant-ID
    // (caso super-admin con impersonation, validado en otro guard).
    const tenantId =
      (request.headers['x-tenant-id'] as string | undefined) || user.activeTenantId;
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
