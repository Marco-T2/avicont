import { Body, Controller, Param, ParseUUIDPipe, Patch, Req, UseGuards } from '@nestjs/common';
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
import { MovimientosBancariosService } from './movimientos-bancarios.service';
import { AuthenticatedRequest, resolveTenantId } from './tenant-request';

/**
 * Ignorar / des-ignorar un movimiento bancario (REQ-CB-18).
 *
 * Misma cadena de guards de clase que el resto del módulo:
 * Auth → ModuleEnabled → Permissions → PackEnabled. Es una ESCRITURA, así que
 * exige `contabilidad.conciliacion.conciliar` (REQ-CB-14 fail-closed).
 */
@ApiTags('Conciliación bancaria — Movimientos')
@ApiBearerAuth('JWT-auth')
@UseGuards(AuthGuard('jwt'), ModuleEnabledGuard, PermissionsGuard, PackEnabledGuard)
@RequireModule('contabilidad')
@RequirePack('contabilidad.conciliacion')
@Controller('movimientos-bancarios')
export class MovimientosBancariosController {
  constructor(private readonly service: MovimientosBancariosService) {}

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
