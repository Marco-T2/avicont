import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { RequireModule } from '../common/decorators/require-module.decorator';
import { ModuleEnabledGuard } from '../common/guards/module-enabled.guard';
import { RequirePermissions } from '../rbac/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../rbac/guards/permissions.guard';

import { CuentasService } from './cuentas.service';
import { CreateCuentaDto } from './dto/create-cuenta.dto';
import { ListarCuentasQueryDto } from './dto/listar-cuentas.dto';
import { UpdateCuentaDto } from './dto/update-cuenta.dto';

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

@ApiTags('Cuentas')
@ApiBearerAuth('JWT-auth')
@UseGuards(AuthGuard('jwt'), ModuleEnabledGuard, PermissionsGuard)
@RequireModule('contabilidad')
@Controller('cuentas')
export class CuentasController {
  constructor(private readonly service: CuentasService) {}

  @Get()
  @RequirePermissions('contabilidad.plan-cuentas.read')
  @ApiOperation({ summary: 'Listar cuentas con filtros y paginación' })
  listar(@Req() req: AuthenticatedRequest, @Query() query: ListarCuentasQueryDto) {
    return this.service.listar(resolveTenantId(req), query);
  }

  @Get('tree')
  @RequirePermissions('contabilidad.plan-cuentas.read')
  @ApiOperation({ summary: 'Obtener el árbol jerárquico completo del plan de cuentas' })
  arbol(@Req() req: AuthenticatedRequest) {
    return this.service.arbolCompleto(resolveTenantId(req));
  }

  @Get(':id')
  @RequirePermissions('contabilidad.plan-cuentas.read')
  @ApiOperation({ summary: 'Detalle de una cuenta' })
  detalle(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.service.obtenerPorId(resolveTenantId(req), id);
  }

  @Get(':id/conceptos')
  @RequirePermissions('contabilidad.plan-cuentas.read')
  @ApiOperation({
    summary:
      'Lista los conceptos de OrgConfiguracionContable que apuntan a esta cuenta (vacío si no está configurada)',
  })
  conceptos(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.service.conceptosQueUsanCuenta(resolveTenantId(req), id);
  }

  @Post()
  @RequirePermissions('contabilidad.plan-cuentas.create')
  @ApiOperation({ summary: 'Crear una cuenta (manual)' })
  crear(@Req() req: AuthenticatedRequest, @Body() dto: CreateCuentaDto) {
    return this.service.crear(resolveTenantId(req), dto);
  }

  @Patch(':id')
  @RequirePermissions('contabilidad.plan-cuentas.update')
  @ApiOperation({
    summary: 'Modificar campos mutables de una cuenta (nombre, descripción, moneda, etc.)',
  })
  actualizar(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: UpdateCuentaDto,
  ) {
    return this.service.actualizar(resolveTenantId(req), id, dto);
  }

  @Delete(':id')
  @HttpCode(200)
  @RequirePermissions('contabilidad.plan-cuentas.delete')
  @ApiOperation({
    summary:
      'Desactivar una cuenta (activa=false). No elimina físicamente. Rechaza si está configurada como concepto.',
  })
  desactivar(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.service.desactivar(resolveTenantId(req), id);
  }
}
