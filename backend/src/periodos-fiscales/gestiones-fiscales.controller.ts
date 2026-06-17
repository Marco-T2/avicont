import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { GestionFiscalStatus } from '@prisma/client';

import {
  CierreEjercicioResponseDto,
  toCierreEjercicioResponse,
} from '@/cierre-ejercicio/dto/cierre-response.dto';
import { CierreEjercicioService } from '@/cierre-ejercicio/cierre-ejercicio.service';
import { RequireModule } from '@/common/decorators/require-module.decorator';
import { ForbiddenError } from '@/common/errors';
import { ModuleEnabledGuard } from '@/common/guards/module-enabled.guard';
import { RequirePermissions } from '@/rbac/decorators/require-permissions.decorator';
import { PermissionsGuard } from '@/rbac/guards/permissions.guard';

import { CrearGestionDto } from './dto/crear-gestion.dto';
import {
  GestionConPeriodosResponseDto,
  GestionResponseDto,
  toGestionConPeriodosResponse,
  toGestionResponse,
} from './dto/gestion-response.dto';
import { GestionesFiscalesService } from './gestiones-fiscales.service';

interface AuthenticatedRequest {
  user: { sub: string; activeTenantId?: string };
  headers: Record<string, string | string[] | undefined>;
}

function resolveTenantId(req: AuthenticatedRequest): string {
  const fromHeader = req.headers['x-tenant-id'];
  const tenantId =
    (Array.isArray(fromHeader) ? fromHeader[0] : fromHeader) || req.user.activeTenantId;
  if (tenantId === undefined || tenantId === '') {
    throw new ForbiddenError('TENANT_CONTEXT_REQUIRED', 'Se requiere contexto de organización');
  }
  return tenantId;
}

@ApiTags('Gestiones Fiscales')
@ApiBearerAuth('JWT-auth')
@UseGuards(AuthGuard('jwt'), ModuleEnabledGuard, PermissionsGuard)
@RequireModule('contabilidad')
@Controller('gestiones')
export class GestionesFiscalesController {
  constructor(
    private readonly service: GestionesFiscalesService,
    private readonly cierreService: CierreEjercicioService,
  ) {}

  @Post()
  @RequirePermissions('contabilidad.gestiones.create')
  @ApiOperation({
    summary:
      'Crear gestión fiscal; genera los 12 períodos automáticamente según tipoEmpresaPrincipal del tenant (Ley 843 art. 46).',
  })
  async crear(
    @Req() req: AuthenticatedRequest,
    @Body() dto: CrearGestionDto,
  ): Promise<GestionConPeriodosResponseDto> {
    const gestion = await this.service.crear(resolveTenantId(req), dto.year);
    return toGestionConPeriodosResponse(gestion);
  }

  @Get()
  @RequirePermissions('contabilidad.gestiones.read')
  @ApiOperation({ summary: 'Listar gestiones fiscales del tenant activo' })
  async listar(
    @Req() req: AuthenticatedRequest,
    @Query('status') status?: GestionFiscalStatus,
  ): Promise<GestionResponseDto[]> {
    const gestiones = await this.service.listar(
      resolveTenantId(req),
      status !== undefined ? { status } : {},
    );
    return gestiones.map(toGestionResponse);
  }

  @Get(':id')
  @RequirePermissions('contabilidad.gestiones.read')
  @ApiOperation({
    summary: 'Detalle de gestión con los 12 períodos incluidos',
  })
  async obtener(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
  ): Promise<GestionConPeriodosResponseDto> {
    const gestion = await this.service.obtenerPorId(id, resolveTenantId(req));
    return toGestionConPeriodosResponse(gestion);
  }

  @Post(':id/cerrar')
  @RequirePermissions('contabilidad.gestiones.cerrar')
  @ApiOperation({
    summary: 'Cerrar gestión fiscal (valida que los 12 períodos estén cerrados)',
  })
  async cerrar(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
  ): Promise<GestionResponseDto> {
    const gestion = await this.service.cerrar(id, resolveTenantId(req), req.user.sub);
    return toGestionResponse(gestion);
  }

  // Cierre del ejercicio (Ley 843 art. 46): genera/consulta los ≤3 comprobantes
  // tipo CIERRE de la gestión. Reusa el permiso `gestiones.cerrar` (generar el
  // cierre ES parte de cerrar la gestión); el GET usa `gestiones.read`. El módulo
  // `contabilidad` ya está exigido a nivel de clase (@RequireModule).
  @Post(':id/cierre')
  @RequirePermissions('contabilidad.gestiones.cerrar')
  @ApiOperation({
    summary:
      'Generar (o regenerar) los comprobantes de cierre del ejercicio de la gestión, en BORRADOR no-editable.',
  })
  @ApiCreatedResponse({ type: CierreEjercicioResponseDto })
  async generarCierre(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
  ): Promise<CierreEjercicioResponseDto> {
    const resultado = await this.cierreService.generarCierre(
      id,
      resolveTenantId(req),
      req.user.sub,
    );
    return toCierreEjercicioResponse(resultado);
  }

  @Get(':id/cierre')
  @RequirePermissions('contabilidad.gestiones.read')
  @ApiOperation({
    summary: 'Consultar el estado de los comprobantes de cierre del ejercicio (preview).',
  })
  @ApiOkResponse({ type: CierreEjercicioResponseDto })
  async obtenerCierre(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
  ): Promise<CierreEjercicioResponseDto> {
    const resultado = await this.cierreService.obtenerEstadoCierre(id, resolveTenantId(req));
    return toCierreEjercicioResponse(resultado);
  }
}
