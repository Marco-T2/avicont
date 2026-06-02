import { Controller, ForbiddenException, Get, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

import { filtrarCatalogoAgrupadoAsignable } from '@/common/permisos/catalogo-asignable';

import { CATALOGO_PERMISOS } from '../common/permisos/catalogo';
import { CatalogoAsignableResolver } from './catalogo-asignable.resolver';

interface JwtUser {
  sub: string;
  activeTenantId?: string;
}

@ApiTags('Permissions')
@ApiBearerAuth('JWT-auth')
@UseGuards(AuthGuard('jwt'))
@Controller('permissions')
export class PermissionsController {
  constructor(private readonly asignableResolver: CatalogoAsignableResolver) {}

  // Catálogo PLANO completo de referencia (todos los permisos del producto). No
  // filtra por org: es la fuente de verdad de qué cadenas existen, útil para
  // herramientas internas. El catálogo ASIGNABLE (lo que se ofrece para armar un
  // CustomRole) es el agrupado de abajo, filtrado por vertical + packs.
  @Get()
  @ApiOperation({ summary: 'Catálogo plano de permisos finos (referencia completa)' })
  list() {
    return CATALOGO_PERMISOS;
  }

  // Catálogo ASIGNABLE agrupado por módulo/submódulo, filtrado server-authoritative
  // por el vertical activo y los packs activos de la org (eje 2, cierre de la
  // deuda RBAC — docs/disenos/packs-eje2.md §7). El frontend (picker) consume
  // YA filtrado, no re-filtra. Espeja el candado de custom-roles.validatePermissions.
  @Get('grouped')
  @ApiOperation({ summary: 'Catálogo asignable agrupado, filtrado por vertical y packs de la org' })
  async grouped(@Req() req: Request) {
    const user = req.user as JwtUser | undefined;
    const tenantId = (req.headers['x-tenant-id'] as string | undefined) || user?.activeTenantId;
    if (!tenantId) {
      // Coherente con el resto de endpoints tenant-scoped: sin contexto de org
      // no hay catálogo asignable que ofrecer.
      throw new ForbiddenException('Se requiere contexto de organización');
    }

    const ctx = await this.asignableResolver.resolver(tenantId);
    return filtrarCatalogoAgrupadoAsignable(ctx);
  }
}
