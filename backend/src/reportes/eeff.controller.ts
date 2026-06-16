import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { RequireModule } from '@/common/decorators/require-module.decorator';
import { ModuleEnabledGuard } from '@/common/guards/module-enabled.guard';
import { RequirePermissions } from '@/rbac/decorators/require-permissions.decorator';
import { PermissionsGuard } from '@/rbac/guards/permissions.guard';

import { BalanceComprobacionService } from './balance-comprobacion.service';
import { BalanceGeneralService } from './balance-general.service';
import { BalanceComprobacionQueryDto } from './dto/balance-comprobacion-query.dto';
import { BalanceComprobacionResponseDto } from './dto/balance-comprobacion-response.dto';
import { BalanceResponseDto } from './dto/balance-response.dto';
import { EeffResultadosQueryDto } from './dto/eeff-resultados-query.dto';
import { BalanceQueryDto } from './dto/balance-query.dto';
import { EstadoResultadosResponseDto } from './dto/eeff-resultados-response.dto';
import { EvolucionPatrimonioQueryDto } from './dto/evolucion-patrimonio-query.dto';
import { EvolucionPatrimonioResponseDto } from './dto/evolucion-patrimonio-response.dto';
import { HojaTrabajoQueryDto } from './dto/hoja-trabajo-query.dto';
import { HojaTrabajoResponseDto } from './dto/hoja-trabajo-response.dto';
import { EstadoResultadosService } from './estado-resultados.service';
import { EvolucionPatrimonioService } from './evolucion-patrimonio.service';
import { HojaTrabajoService } from './hoja-trabajo.service';
import { resolveTenantId } from './tenant-id';
import type { AuthenticatedRequest } from './tenant-id';

/**
 * Controller de Estados Financieros (EEFF).
 *
 * Separado de ReportesController (@Controller('libros')) porque los EEFF
 * son una familia distinta de los Libros Contables.
 *
 * RBAC: contabilidad.eeff.read (REQ-BG-13, REQ-ER-11).
 */
@ApiTags('Estados Financieros')
@ApiBearerAuth('JWT-auth')
@UseGuards(AuthGuard('jwt'), ModuleEnabledGuard, PermissionsGuard)
@RequireModule('contabilidad')
@Controller('eeff')
export class EeffController {
  constructor(
    private readonly balanceGeneralService: BalanceGeneralService,
    private readonly estadoResultadosService: EstadoResultadosService,
    private readonly balanceComprobacionService: BalanceComprobacionService,
    private readonly hojaTrabajoService: HojaTrabajoService,
    private readonly evolucionPatrimonioService: EvolucionPatrimonioService,
  ) {}

  @Get('balance')
  @RequirePermissions('contabilidad.eeff.read')
  @ApiOperation({
    summary:
      'Balance General: Estado de Situación Financiera a una fecha de corte. ' +
      'Requiere fecha=YYYY-MM-DD. Presenta Activo, Pasivo y Patrimonio con Resultado del Ejercicio. ' +
      'REQ-BG-01..15.',
  })
  @ApiOkResponse({ type: BalanceResponseDto })
  obtenerBalanceGeneral(@Req() req: AuthenticatedRequest, @Query() query: BalanceQueryDto) {
    const tenantId = resolveTenantId(req);
    // exactOptionalPropertyTypes activo (CLAUDE.md §2.5.1): spread condicional
    // para campos opcionales del DTO.
    return this.balanceGeneralService.consultarBalanceGeneral(tenantId, {
      fecha: query.fecha,
      ...(query.gestionId !== undefined ? { gestionId: query.gestionId } : {}),
      incluirAnulados: query.incluirAnulados ?? false,
    });
  }

  @Get('resultados')
  @RequirePermissions('contabilidad.eeff.read')
  @ApiOperation({
    summary:
      'Estado de Resultados (Income Statement) — flujo del período. ' +
      'Acepta fechaDesde+fechaHasta, periodoFiscalId o gestionId. ' +
      'Presenta Ingresos y Egresos con Resultado del Ejercicio. ' +
      'REQ-ER-01..12.',
  })
  @ApiOkResponse({ type: EstadoResultadosResponseDto })
  obtenerEstadoResultados(
    @Req() req: AuthenticatedRequest,
    @Query() query: EeffResultadosQueryDto,
  ) {
    const tenantId = resolveTenantId(req);
    // exactOptionalPropertyTypes activo (CLAUDE.md §2.5.1): spread condicional
    // para campos opcionales del DTO.
    return this.estadoResultadosService.consultarEstadoResultados(tenantId, {
      ...(query.fechaDesde !== undefined ? { fechaDesde: query.fechaDesde } : {}),
      ...(query.fechaHasta !== undefined ? { fechaHasta: query.fechaHasta } : {}),
      ...(query.periodoFiscalId !== undefined ? { periodoFiscalId: query.periodoFiscalId } : {}),
      ...(query.gestionId !== undefined ? { gestionId: query.gestionId } : {}),
      incluirAnulados: query.incluirAnulados ?? false,
    });
  }

  @Get('balance-comprobacion')
  @RequirePermissions('contabilidad.eeff.read')
  @ApiOperation({
    summary:
      'Balance de Comprobación de Sumas y Saldos — reporte de control de 4 columnas. ' +
      'Acepta el rango por desde+hasta O por periodoFiscalId (excluyentes). ' +
      'Por cada cuenta de detalle con movimiento muestra sumas (débito/crédito) y ' +
      'saldos (deudor/acreedor), con verificación de cuadre. REQ-BC-01..13.',
  })
  @ApiOkResponse({ type: BalanceComprobacionResponseDto })
  obtenerBalanceComprobacion(
    @Req() req: AuthenticatedRequest,
    @Query() query: BalanceComprobacionQueryDto,
  ) {
    const tenantId = resolveTenantId(req);
    // exactOptionalPropertyTypes activo (CLAUDE.md §2.5.1): spread condicional
    // para campos opcionales del DTO.
    return this.balanceComprobacionService.consultarBalanceComprobacion(tenantId, {
      ...(query.desde !== undefined ? { desde: query.desde } : {}),
      ...(query.hasta !== undefined ? { hasta: query.hasta } : {}),
      ...(query.periodoFiscalId !== undefined ? { periodoFiscalId: query.periodoFiscalId } : {}),
      incluirAnulados: query.incluirAnulados ?? false,
    });
  }

  @Get('hoja-trabajo')
  @RequirePermissions('contabilidad.eeff.read')
  @ApiOperation({
    summary:
      'Hoja de Trabajo de 12 Columnas — instrumento de cierre contable. ' +
      'Acepta el rango por desde+hasta O por periodoFiscalId (excluyentes). ' +
      'Presenta sumas ordinarias, saldo de comprobación, ajustes, saldo ajustado, ' +
      'columnas de Estado de Resultados y de Balance General con 6 cuadres. REQ-HT-01..22.',
  })
  @ApiOkResponse({ type: HojaTrabajoResponseDto })
  obtenerHojaTrabajo(@Req() req: AuthenticatedRequest, @Query() query: HojaTrabajoQueryDto) {
    const tenantId = resolveTenantId(req);
    // exactOptionalPropertyTypes activo (CLAUDE.md §2.5.1): spread condicional
    // para campos opcionales del DTO.
    return this.hojaTrabajoService.consultarHojaTrabajo(tenantId, {
      ...(query.desde !== undefined ? { desde: query.desde } : {}),
      ...(query.hasta !== undefined ? { hasta: query.hasta } : {}),
      ...(query.periodoFiscalId !== undefined ? { periodoFiscalId: query.periodoFiscalId } : {}),
      incluirAnulados: query.incluirAnulados ?? false,
    });
  }

  @Get('evolucion-patrimonio')
  @RequirePermissions('contabilidad.eeff.read')
  @ApiOperation({
    summary:
      'Estado de Evolución del Patrimonio Neto (EEPN) — 4º estado financiero formal. ' +
      'Acepta fechaDesde+fechaHasta, periodoFiscalId o gestionId (forma habitual). ' +
      'Por cada componente del patrimonio muestra saldo inicial, resultado del ejercicio ' +
      '(en curso), otros movimientos y saldo final, con verificación de cuadre.',
  })
  @ApiOkResponse({ type: EvolucionPatrimonioResponseDto })
  obtenerEvolucionPatrimonio(
    @Req() req: AuthenticatedRequest,
    @Query() query: EvolucionPatrimonioQueryDto,
  ) {
    const tenantId = resolveTenantId(req);
    // exactOptionalPropertyTypes activo (CLAUDE.md §2.5.1): spread condicional
    // para campos opcionales del DTO.
    return this.evolucionPatrimonioService.consultarEvolucionPatrimonio(tenantId, {
      ...(query.fechaDesde !== undefined ? { fechaDesde: query.fechaDesde } : {}),
      ...(query.fechaHasta !== undefined ? { fechaHasta: query.fechaHasta } : {}),
      ...(query.periodoFiscalId !== undefined ? { periodoFiscalId: query.periodoFiscalId } : {}),
      ...(query.gestionId !== undefined ? { gestionId: query.gestionId } : {}),
      incluirAnulados: query.incluirAnulados ?? false,
    });
  }
}
