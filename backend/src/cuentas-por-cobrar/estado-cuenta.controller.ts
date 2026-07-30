import { Controller, Get, Param, ParseUUIDPipe, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';

import { RequireModule } from '@/common/decorators/require-module.decorator';
import { ModuleEnabledGuard } from '@/common/guards/module-enabled.guard';
import { RequirePermissions } from '@/rbac/decorators/require-permissions.decorator';
import { PermissionsGuard } from '@/rbac/guards/permissions.guard';

import { EstadoCuentaResponseDto, toEstadoCuentaResponse } from './dto/estado-cuenta-response.dto';
import { EstadoCuentaService } from './estado-cuenta.service';
import { AuthenticatedRequest, resolveTenantId } from './tenant-request';

// Estado de cuenta por cliente (REQ-CXC-07). Controller propio y no una ruta
// de `CobrosController` porque `GET /cobros/:id` parsea `:id` como UUID y
// `GET /cobros/estado-cuenta/...` dependería del orden de registro de rutas
// para no caer ahí — una URL raíz elimina la ambigüedad.
//
// Bajo `cobros.read` (REQ-CXC-10 explícita): un usuario de sólo lectura no
// puede registrar ni aplicar, pero SÍ puede ver el estado de cuenta.
@ApiTags('Cobros')
@ApiBearerAuth('JWT-auth')
@UseGuards(AuthGuard('jwt'), ModuleEnabledGuard, PermissionsGuard)
@RequireModule('contabilidad')
@Controller('estado-cuenta')
export class EstadoCuentaController {
  constructor(private readonly service: EstadoCuentaService) {}

  @Get(':contactoId')
  @RequirePermissions('contabilidad.cobros.read')
  @ApiParam({ name: 'contactoId', format: 'uuid' })
  @ApiOperation({
    summary:
      'Estado de cuenta del cliente (REQ-CXC-07): ventas de la cartera con saldo > 0 en orden canónico FIFO (el frontend auto-tilda sobre este orden), días de atraso derivados vía ClockPort y saldo a favor. Todo derivado, nada persistido.',
  })
  @ApiOkResponse({ type: EstadoCuentaResponseDto })
  async obtener(
    @Req() req: AuthenticatedRequest,
    @Param('contactoId', new ParseUUIDPipe()) contactoId: string,
  ): Promise<EstadoCuentaResponseDto> {
    return toEstadoCuentaResponse(await this.service.obtener(resolveTenantId(req), contactoId));
  }
}
