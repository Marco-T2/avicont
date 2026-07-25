import { Body, Controller, Get, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { RequireModule } from '@/common/decorators/require-module.decorator';
import { RequirePack } from '@/common/decorators/require-pack.decorator';
import { Money } from '@/common/domain/money';
import { ModuleEnabledGuard } from '@/common/guards/module-enabled.guard';
import { PackEnabledGuard } from '@/common/guards/pack-enabled.guard';
import { RequirePermissions } from '@/rbac/decorators/require-permissions.decorator';
import { PermissionsGuard } from '@/rbac/guards/permissions.guard';

import { DeclararArranqueDto } from './dto/declarar-arranque.dto';
import { InformeConciliacionQueryDto } from './dto/informe-conciliacion-query.dto';
import {
  ArranqueAplicadoDto,
  InformeConciliacionResponseDto,
  toArranqueAplicadoResponse,
  toInformeConciliacionResponse,
} from './dto/informe-conciliacion-response.dto';
import { InformeConciliacionService } from './informe-conciliacion.service';
import { AuthenticatedRequest, resolveTenantId } from './tenant-request';

/**
 * Informe de conciliación bancaria (REQ-ICB-01..09) + declaración del punto
 * de arranque (REQ-ICB-04).
 *
 * Misma cadena de guards de clase que el workspace: Auth →
 * ModuleEnabled('contabilidad') → Permissions → PackEnabled — sin pack activo
 * estos endpoints "no existen" (404).
 *
 * D7: consultar pide `.read`; declarar un arranque pide `.conciliar` — fija el
 * saldo de partida sobre el que se apoyan todos los informes futuros, un acto
 * de la misma familia que confirmar un match. NO se introduce permiso nuevo.
 */
@ApiTags('Conciliación bancaria — Informe')
@ApiBearerAuth('JWT-auth')
@UseGuards(AuthGuard('jwt'), ModuleEnabledGuard, PermissionsGuard, PackEnabledGuard)
@RequireModule('contabilidad')
@RequirePack('contabilidad.conciliacion')
@Controller('conciliacion')
export class InformeConciliacionController {
  constructor(private readonly informe: InformeConciliacionService) {}

  @Get('informe')
  @RequirePermissions('contabilidad.conciliacion.read')
  @ApiOperation({
    summary:
      'Informe de conciliación a una fecha de corte: saldo según extracto ± partidas = saldo según libros, con el puente detallado.',
    description:
      'LECTURA PURA (REQ-ICB-04): consultar jamás crea, modifica ni infiere un arranque. ' +
      'Sin arranque declarado el informe se emite ABSTENIDO; con insumos no confiables ' +
      'se emite igual y la sección `confiabilidad` nombra el problema (REQ-ICB-05).',
  })
  @ApiOkResponse({ type: InformeConciliacionResponseDto })
  async obtenerInforme(
    @Req() req: AuthenticatedRequest,
    @Query() query: InformeConciliacionQueryDto,
  ): Promise<InformeConciliacionResponseDto> {
    const resultado = await this.informe.obtenerInforme(resolveTenantId(req), {
      cuentaBancariaId: query.cuentaBancariaId,
      corte: new Date(`${query.corte}T00:00:00.000Z`),
    });
    return toInformeConciliacionResponse(resultado);
  }

  @Post('arranques')
  @RequirePermissions('contabilidad.conciliacion.conciliar')
  @ApiOperation({
    summary:
      'Declara un punto de arranque conciliado: fecha, ambos saldos y la diferencia residual ACEPTADA — los cuatro datos declarados por el usuario.',
    description:
      'Append-only (REQ-ICB-04): una declaración posterior nunca borra ni sobrescribe ' +
      'las anteriores; `vigenteA` decide cuál aplica a cada corte. La diferencia ' +
      'residual NO se calcula como extracto − libros: el usuario declara solo la ' +
      'parte que asume como inexplicable.',
  })
  @ApiCreatedResponse({ type: ArranqueAplicadoDto })
  async declararArranque(
    @Req() req: AuthenticatedRequest,
    @Body() dto: DeclararArranqueDto,
  ): Promise<ArranqueAplicadoDto> {
    const declarado = await this.informe.declararArranque(resolveTenantId(req), req.user.sub, {
      cuentaBancariaId: dto.cuentaBancariaId,
      fecha: new Date(`${dto.fecha}T00:00:00.000Z`),
      saldoExtracto: Money.of(dto.saldoExtracto),
      saldoLibros: Money.of(dto.saldoLibros),
      diferenciaResidual: Money.of(dto.diferenciaResidual),
      nota: dto.nota ?? null,
    });
    return toArranqueAplicadoResponse(declarado);
  }
}
