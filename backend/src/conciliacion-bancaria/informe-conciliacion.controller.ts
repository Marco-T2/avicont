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

import { CandidatosArranqueQueryDto } from './dto/candidatos-arranque-query.dto';
import { DeclararArranqueDto } from './dto/declarar-arranque.dto';
import { HistorialArranquesQueryDto } from './dto/historial-arranques-query.dto';
import { InformeConciliacionQueryDto } from './dto/informe-conciliacion-query.dto';
import {
  ArranqueAplicadoDto,
  CandidatoPartidaArranqueDto,
  InformeConciliacionResponseDto,
  toArranqueAplicadoResponse,
  toCandidatoPartidaResponse,
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

  @Get('arranques')
  @RequirePermissions('contabilidad.conciliacion.read')
  @ApiOperation({
    summary:
      'Historial COMPLETO de declaraciones de arranque de una cuenta bancaria, más reciente primero.',
    description:
      'Mirar el historial es LECTURA (D7: `.read`; declarar exige `.conciliar`). ' +
      'Orden `fecha DESC, createdAt DESC` — el MISMO desempate de `vigenteA` — así ' +
      'la UI señala cuál declaración aplica a un corte sin re-ordenar: es la ' +
      'primera fila con `fecha <= corte` (design D8). Sin paginar: REQ-ICB-04 ' +
      'exige mostrarlo entero, ninguna declaración se oculta.',
  })
  @ApiOkResponse({ type: ArranqueAplicadoDto, isArray: true })
  async listarArranques(
    @Req() req: AuthenticatedRequest,
    @Query() query: HistorialArranquesQueryDto,
  ): Promise<ArranqueAplicadoDto[]> {
    const historial = await this.informe.listarHistorial(
      resolveTenantId(req),
      query.cuentaBancariaId,
    );
    return historial.map(toArranqueAplicadoResponse);
  }

  @Get('arranques/candidatos')
  @RequirePermissions('contabilidad.conciliacion.conciliar')
  @ApiOperation({
    summary:
      'Partidas que quedarían ABIERTAS a una fecha: la propuesta que el usuario confirma antes de declarar el arranque.',
    description:
      'LECTURA PURA: no declara nada. Una línea anterior al arranque sin movimiento que ' +
      'la reclame puede ser un cheque en circulación (se arrastra) o el asiento de ' +
      'apertura (su saldo YA está dentro del extracto declarado), y con los datos ' +
      'disponibles son indistinguibles — si la organización importó extractos recién ' +
      'desde el arranque, TODA línea anterior parece en tránsito. Por eso decide quien ' +
      'concilia. Pide `.conciliar` y no `.read`: es un paso de la declaración. ' +
      'Verificación aritmética: la suma de lo confirmado debe dar ' +
      '`saldoLibros − saldoExtracto + diferenciaResidual`.',
  })
  @ApiOkResponse({ type: CandidatoPartidaArranqueDto, isArray: true })
  async listarCandidatos(
    @Req() req: AuthenticatedRequest,
    @Query() query: CandidatosArranqueQueryDto,
  ): Promise<CandidatoPartidaArranqueDto[]> {
    const candidatos = await this.informe.listarCandidatosDeArranque(
      resolveTenantId(req),
      query.cuentaBancariaId,
      new Date(`${query.fecha}T00:00:00.000Z`),
    );
    return candidatos.map(toCandidatoPartidaResponse);
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
      referenciasPartidas: dto.referenciasPartidas,
    });
    return toArranqueAplicadoResponse(declarado);
  }
}
