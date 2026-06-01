import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';

@Injectable()
export class SuperAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<{ user?: { isSuperAdmin?: boolean } }>();
    const user = req.user;
    // Comparación estricta === true: un valor truthy (ej: 1, "true") NO es suficiente.
    // docs/disenos/super-admin-plataforma.md §4.3
    if (user?.isSuperAdmin !== true) {
      throw new ForbiddenException('Se requiere privilegio de plataforma');
    }
    return true;
  }
}
