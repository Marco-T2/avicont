import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { RequireModule } from '@/common/decorators/require-module.decorator';
import { ModuleEnabledGuard } from '@/common/guards/module-enabled.guard';
import { RequirePermissions } from '@/rbac/decorators/require-permissions.decorator';
import { PermissionsGuard } from '@/rbac/guards/permissions.guard';

import { BalanceGeneralService } from './balance-general.service';
import { BalanceResponseDto } from './dto/balance-response.dto';
import { EeffResultadosQueryDto } from './dto/eeff-resultados-query.dto';
import { BalanceQueryDto } from './dto/balance-query.dto';
import { EstadoResultadosResponseDto } from './dto/eeff-resultados-response.dto';
import { EstadoResultadosService } from './estado-resultados.service';
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
}
