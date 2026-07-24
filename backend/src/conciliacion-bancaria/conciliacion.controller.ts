import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';

import { RequireModule } from '@/common/decorators/require-module.decorator';
import { RequirePack } from '@/common/decorators/require-pack.decorator';
import { ModuleEnabledGuard } from '@/common/guards/module-enabled.guard';
import { PackEnabledGuard } from '@/common/guards/pack-enabled.guard';
import { RequirePermissions } from '@/rbac/decorators/require-permissions.decorator';
import { PermissionsGuard } from '@/rbac/guards/permissions.guard';

import { ConciliacionService } from './conciliacion.service';
import {
  CrearMatchDto,
  MatchConciliacionResponseDto,
  toMatchConciliacionResponse,
} from './dto/crear-match.dto';
import { WorkspaceConciliacionQueryDto } from './dto/workspace-conciliacion-query.dto';
import {
  toWorkspaceConciliacionResponse,
  WorkspaceConciliacionResponseDto,
} from './dto/workspace-conciliacion-response.dto';
import { MatchConciliacionService } from './match-conciliacion.service';
import { AuthenticatedRequest, resolveTenantId } from './tenant-request';

/**
 * Workspace de conciliación (design §10) + confirmar/deshacer matches
 * (REQ-CB-17).
 *
 * Cadena de guards de CLASE: Auth → ModuleEnabled('contabilidad') →
 * Permissions → PackEnabled('contabilidad.conciliacion'). El pack gatea el
 * controller COMPLETO — sin pack activo estos endpoints "no existen" (404).
 *
 * REQ-CB-14 (modo consulta, fail-closed): la lectura pide `.read`; TODA
 * escritura pide `.conciliar`. Un usuario con solo `.read` ve el workspace
 * completo y recibe 403 en cualquier acción.
 */
@ApiTags('Conciliación bancaria — Workspace')
@ApiBearerAuth('JWT-auth')
@UseGuards(AuthGuard('jwt'), ModuleEnabledGuard, PermissionsGuard, PackEnabledGuard)
@RequireModule('contabilidad')
@RequirePack('contabilidad.conciliacion')
@Controller('conciliacion')
export class ConciliacionController {
  constructor(
    private readonly conciliacion: ConciliacionService,
    private readonly matches: MatchConciliacionService,
  ) {}

  @Get()
  @RequirePermissions('contabilidad.conciliacion.read')
  @ApiOperation({
    summary:
      'Workspace de conciliación: movimientos bancarios + líneas contables de la cuenta banco en el rango, con estados DERIVADOS y sugerencias ranqueadas.',
    description:
      'Verifica el ancla de cada match en memoria contra su snapshot (REQ-CB-10). Es LECTURA PURA: nunca escribe, ni siquiera para "curar" un vínculo roto.',
  })
  @ApiOkResponse({ type: WorkspaceConciliacionResponseDto })
  async obtenerWorkspace(
    @Req() req: AuthenticatedRequest,
    @Query() query: WorkspaceConciliacionQueryDto,
  ): Promise<WorkspaceConciliacionResponseDto> {
    const ws = await this.conciliacion.obtenerWorkspace(resolveTenantId(req), {
      cuentaBancariaId: query.cuentaBancariaId,
      desde: new Date(`${query.desde}T00:00:00.000Z`),
      hasta: new Date(`${query.hasta}T00:00:00.000Z`),
    });
    return toWorkspaceConciliacionResponse(ws);
  }

  @Post('matches')
  @RequirePermissions('contabilidad.conciliacion.conciliar')
  @ApiOperation({
    summary:
      'Confirma un par movimiento ↔ línea contable creando el MatchConciliacion (REQ-CB-17). El sistema NUNCA auto-confirma.',
  })
  @ApiCreatedResponse({ type: MatchConciliacionResponseDto })
  async crearMatch(
    @Req() req: AuthenticatedRequest,
    @Body() dto: CrearMatchDto,
  ): Promise<MatchConciliacionResponseDto> {
    const match = await this.matches.crearMatch(resolveTenantId(req), req.user.sub, {
      movimientoBancarioId: dto.movimientoBancarioId,
      comprobanteId: dto.comprobanteId,
      orden: dto.orden,
      confianzaSugerida: dto.confianzaSugerida ?? null,
    });
    return toMatchConciliacionResponse(match);
  }

  @Delete('matches/:id')
  @HttpCode(204)
  @RequirePermissions('contabilidad.conciliacion.conciliar')
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOperation({
    summary:
      'Deshace un match: lo borra y devuelve el movimiento a PENDIENTE. NUNCA toca el comprobante ni sus líneas (REQ-CB-15).',
  })
  async borrarMatch(
    @Req() req: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<void> {
    await this.matches.borrarMatch(resolveTenantId(req), id);
  }
}
