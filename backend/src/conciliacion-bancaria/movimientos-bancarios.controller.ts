import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';

import { RequireModule } from '@/common/decorators/require-module.decorator';
import { RequirePack } from '@/common/decorators/require-pack.decorator';
import { ModuleEnabledGuard } from '@/common/guards/module-enabled.guard';
import { PackEnabledGuard } from '@/common/guards/pack-enabled.guard';
import { RequirePermissions } from '@/rbac/decorators/require-permissions.decorator';
import { PermissionsGuard } from '@/rbac/guards/permissions.guard';

import {
  ActualizarEstadoMovimientoDto,
  MovimientoBancarioResponseDto,
  toMovimientoBancarioResponse,
} from './dto/actualizar-estado-movimiento.dto';
import {
  ListadoMovimientosBancariosResponseDto,
  ListarMovimientosBancariosQueryDto,
  LISTADO_DEFAULT_LIMIT,
  toListadoMovimientosBancariosResponse,
} from './dto/listar-movimientos-bancarios.dto';
import { MovimientosBancariosService } from './movimientos-bancarios.service';
import { AuthenticatedRequest, resolveTenantId } from './tenant-request';

/**
 * Verificador de movimientos bancarios (REQ-VMB) + ignorar/des-ignorar un
 * movimiento (REQ-CB-18).
 *
 * Misma cadena de guards de clase que el resto del módulo:
 * Auth → ModuleEnabled → Permissions → PackEnabled. El listado es LECTURA y
 * pide `.read`; el cambio de estado es ESCRITURA y exige
 * `contabilidad.conciliacion.conciliar` (REQ-CB-14 fail-closed).
 */
@ApiTags('Conciliación bancaria — Movimientos')
@ApiBearerAuth('JWT-auth')
@UseGuards(AuthGuard('jwt'), ModuleEnabledGuard, PermissionsGuard, PackEnabledGuard)
@RequireModule('contabilidad')
@RequirePack('contabilidad.conciliacion')
@Controller('movimientos-bancarios')
export class MovimientosBancariosController {
  constructor(private readonly service: MovimientosBancariosService) {}

  @Get()
  @RequirePermissions('contabilidad.conciliacion.read')
  @ApiOperation({
    summary:
      'Mayor unificado cross-cuenta: movimientos de TODOS los bancos del rango con estado derivado, saldos vigentes por cuenta y totales por moneda (REQ-VMB-01).',
    description:
      'Herramienta de APOYO, no limitante: sin filtro `estado` nada se esconde (REQ-VMB-02). Es LECTURA PURA — nunca escribe, ni siquiera para "curar" un vínculo roto (REQ-VMB-06).',
  })
  @ApiOkResponse({ type: ListadoMovimientosBancariosResponseDto })
  async listar(
    @Req() req: AuthenticatedRequest,
    @Query() query: ListarMovimientosBancariosQueryDto,
  ): Promise<ListadoMovimientosBancariosResponseDto> {
    const listado = await this.service.listar(resolveTenantId(req), {
      desde: new Date(`${query.desde}T00:00:00.000Z`),
      hasta: new Date(`${query.hasta}T00:00:00.000Z`),
      page: query.page ?? 1,
      limit: query.limit ?? LISTADO_DEFAULT_LIMIT,
      ...(query.cuentaBancariaId !== undefined ? { cuentaBancariaId: query.cuentaBancariaId } : {}),
      ...(query.estado !== undefined ? { estado: query.estado } : {}),
      ...(query.montoDesde !== undefined ? { montoDesde: query.montoDesde } : {}),
      ...(query.montoHasta !== undefined ? { montoHasta: query.montoHasta } : {}),
      ...(query.glosa !== undefined ? { glosa: query.glosa } : {}),
    });
    return toListadoMovimientosBancariosResponse(listado);
  }

  @Patch(':id/estado')
  @RequirePermissions('contabilidad.conciliacion.conciliar')
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOperation({
    summary:
      'Ignora (IGNORADO) o des-ignora (PENDIENTE) un movimiento bancario. Nunca borra el movimiento ni toca sus matches (REQ-CB-18).',
  })
  @ApiOkResponse({ type: MovimientoBancarioResponseDto })
  async cambiarEstado(
    @Req() req: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: ActualizarEstadoMovimientoDto,
  ): Promise<MovimientoBancarioResponseDto> {
    const movimiento = await this.service.cambiarEstado(resolveTenantId(req), id, dto.estado);
    return toMovimientoBancarioResponse(movimiento);
  }
}
