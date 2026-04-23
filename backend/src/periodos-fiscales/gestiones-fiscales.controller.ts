import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { GestionFiscalStatus } from '@prisma/client';

import { ForbiddenError } from '@/common/errors';
import { RequirePermissions } from '@/rbac/decorators/require-permissions.decorator';
import { PermissionsGuard } from '@/rbac/guards/permissions.guard';

import { CrearGestionDto } from './dto/crear-gestion.dto';
import { GestionesFiscalesService } from './gestiones-fiscales.service';

interface AuthenticatedRequest {
  user: { sub: string; activeTenantId?: string };
  headers: Record<string, string | string[] | undefined>;
}

function resolveTenantId(req: AuthenticatedRequest): string {
  const fromHeader = req.headers['x-tenant-id'];
  const tenantId =
    (Array.isArray(fromHeader) ? fromHeader[0] : fromHeader) ||
    req.user.activeTenantId;
  if (tenantId === undefined || tenantId === '') {
    throw new ForbiddenError(
      'TENANT_CONTEXT_REQUIRED',
      'Se requiere contexto de organización',
    );
  }
  return tenantId;
}

@ApiTags('Gestiones Fiscales')
@ApiBearerAuth('JWT-auth')
@UseGuards(AuthGuard('jwt'), PermissionsGuard)
@Controller('gestiones')
export class GestionesFiscalesController {
  constructor(private readonly service: GestionesFiscalesService) {}

  @Post()
  @RequirePermissions('contabilidad.gestiones.create')
  @ApiOperation({
    summary:
      'Crear gestión fiscal; genera los 12 períodos automáticamente según tipoEmpresaPrincipal del tenant (Ley 843 art. 46).',
  })
  crear(@Req() req: AuthenticatedRequest, @Body() dto: CrearGestionDto) {
    return this.service.crear(resolveTenantId(req), dto.year);
  }

  @Get()
  @RequirePermissions('contabilidad.gestiones.read')
  @ApiOperation({ summary: 'Listar gestiones fiscales del tenant activo' })
  listar(
    @Req() req: AuthenticatedRequest,
    @Query('status') status?: GestionFiscalStatus,
  ) {
    return this.service.listar(
      resolveTenantId(req),
      status !== undefined ? { status } : {},
    );
  }

  @Get(':id')
  @RequirePermissions('contabilidad.gestiones.read')
  @ApiOperation({
    summary: 'Detalle de gestión con los 12 períodos incluidos',
  })
  obtener(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.service.obtenerPorId(id, resolveTenantId(req));
  }

  @Post(':id/cerrar')
  @RequirePermissions('contabilidad.gestiones.cerrar')
  @ApiOperation({
    summary: 'Cerrar gestión fiscal (valida que los 12 períodos estén cerrados)',
  })
  cerrar(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.service.cerrar(id, resolveTenantId(req), req.user.sub);
  }
}
