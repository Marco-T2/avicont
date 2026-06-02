import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { SystemRole } from '@prisma/client';

import { ForbiddenError } from '@/common/errors';

import { REQUIRE_SYSTEM_ROLE_KEY } from '../decorators/require-system-role.decorator';

// Guard que gatea endpoints por el SystemRole del miembro en la org activa
// (OWNER/ADMIN), NO por un permiso fino del catálogo. Decoración requerida:
// @RequireSystemRole(SystemRole.OWNER, SystemRole.ADMIN).
//
// Lee el claim `roles` del JWT (req.user.roles), que `auth.service` puebla con
// el SystemRole o el slug del custom role del miembro para el tenant activo
// (extractRolesForTenant). Los valores de SystemRole son MAYÚSCULAS ('OWNER',
// 'ADMIN'); los slugs de custom roles son minúsculas ('contador'), así que no
// hay colisión: un custom role nunca satisface @RequireSystemRole(OWNER/ADMIN).
//
// Se registra a nivel de controller en @UseGuards, DESPUÉS de AuthGuard('jwt')
// (necesita req.user). Endpoints sin @RequireSystemRole pasan transparentes.
@Injectable()
export class SystemRolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const rolesRequeridos = this.reflector.getAllAndOverride<SystemRole[] | undefined>(
      REQUIRE_SYSTEM_ROLE_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!rolesRequeridos || rolesRequeridos.length === 0) return true;

    const request = context.switchToHttp().getRequest();
    const user = request.user as { roles?: string[] } | undefined;
    const rolesUsuario = user?.roles ?? [];

    const autorizado = rolesRequeridos.some((rol) => rolesUsuario.includes(rol));
    if (!autorizado) {
      throw new ForbiddenError(
        'SYSTEM_ROLE_REQUERIDO',
        'Se requiere ser propietario o administrador de la organización',
      );
    }
    return true;
  }
}
