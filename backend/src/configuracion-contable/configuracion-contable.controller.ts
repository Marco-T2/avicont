import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { RequireModule } from '../common/decorators/require-module.decorator';
import { ModuleEnabledGuard } from '../common/guards/module-enabled.guard';
import { RequirePermissions } from '../rbac/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../rbac/guards/permissions.guard';

import { ConfiguracionContableService } from './configuracion-contable.service';
import { ActualizarConfiguracionDto } from './dto/actualizar-configuracion.dto';
import { ConfiguracionContableResponseDto } from './dto/configuracion-response.dto';

interface AuthenticatedRequest {
  user: { sub: string; activeTenantId?: string };
  headers: Record<string, string | string[] | undefined>;
}

function resolveTenantId(req: AuthenticatedRequest): string {
  const fromHeader = req.headers['x-tenant-id'];
  const tenantId =
    (Array.isArray(fromHeader) ? fromHeader[0] : fromHeader) || req.user.activeTenantId;
  if (tenantId === undefined || tenantId === '') {
    throw new ForbiddenException('Se requiere contexto de organización');
  }
  return tenantId;
}

@ApiTags('Configuración Contable')
@ApiBearerAuth('JWT-auth')
@UseGuards(AuthGuard('jwt'), ModuleEnabledGuard, PermissionsGuard)
@RequireModule('contabilidad')
@Controller('configuracion-contable')
export class ConfiguracionContableController {
  constructor(private readonly service: ConfiguracionContableService) {}

  @Get()
  @RequirePermissions('contabilidad.configuracion.read')
  @ApiOperation({
    summary:
      'Obtener la configuración contable (mapeo de conceptos a cuentas). Devuelve vacía si aún no hay fila.',
  })
  @ApiOkResponse({ type: ConfiguracionContableResponseDto })
  obtener(@Req() req: AuthenticatedRequest) {
    return this.service.obtener(resolveTenantId(req));
  }

  @Patch()
  @RequirePermissions('contabilidad.configuracion.update')
  @ApiOperation({
    summary:
      'Actualizar (upsert) uno o más conceptos. null = desmapear. Valida clase, activa, esDetalle.',
  })
  @ApiOkResponse({ type: ConfiguracionContableResponseDto })
  actualizar(@Req() req: AuthenticatedRequest, @Body() dto: ActualizarConfiguracionDto) {
    return this.service.actualizar(resolveTenantId(req), dto);
  }

  @Delete(':concepto')
  @RequirePermissions('contabilidad.configuracion.update')
  @ApiOperation({
    summary: 'Desmapear un concepto específico (atajo para PATCH con ese campo en null).',
  })
  @ApiOkResponse({ type: ConfiguracionContableResponseDto })
  desmapear(@Req() req: AuthenticatedRequest, @Param('concepto') concepto: string) {
    return this.service.desmapearConcepto(resolveTenantId(req), concepto);
  }
}
