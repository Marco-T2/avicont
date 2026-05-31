import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { RequireModule } from '@/common/decorators/require-module.decorator';
import { ModuleEnabledGuard } from '@/common/guards/module-enabled.guard';
import { RequirePermissions } from '@/rbac/decorators/require-permissions.decorator';
import { PermissionsGuard } from '@/rbac/guards/permissions.guard';

import { LibroDiarioQueryDto } from './dto/libro-diario-query.dto';
import { LibroMayorQueryDto } from './dto/libro-mayor-query.dto';
import { LibroDiarioService } from './libro-diario.service';
import { LibroMayorService } from './libro-mayor.service';
import { resolveTenantId } from './tenant-id';
import type { AuthenticatedRequest } from './tenant-id';

@ApiTags('Libros contables')
@ApiBearerAuth('JWT-auth')
@UseGuards(AuthGuard('jwt'), ModuleEnabledGuard, PermissionsGuard)
@RequireModule('contabilidad')
@Controller('libros')
export class ReportesController {
  constructor(
    private readonly libroDiarioService: LibroDiarioService,
    private readonly libroMayorService: LibroMayorService,
  ) {}

  @Get('diario')
  @RequirePermissions('contabilidad.libro-diario.read')
  @ApiOperation({
    summary:
      'Libro Diario: listado cronológico de asientos CONTABILIZADOS y BLOQUEADOS. ' +
      'Filtrar por periodoFiscalId O fechaDesde+fechaHasta. Tope: 5.000 asientos (REQ-LD-10).',
  })
  obtenerLibroDiario(@Req() req: AuthenticatedRequest, @Query() query: LibroDiarioQueryDto) {
    const tenantId = resolveTenantId(req);
    // exactOptionalPropertyTypes activo (CLAUDE.md §2.5.1): spread condicional
    // para campos opcionales del DTO.
    return this.libroDiarioService.consultarLibroDiario(tenantId, {
      ...(query.periodoFiscalId !== undefined ? { periodoFiscalId: query.periodoFiscalId } : {}),
      ...(query.fechaDesde !== undefined ? { fechaDesde: query.fechaDesde } : {}),
      ...(query.fechaHasta !== undefined ? { fechaHasta: query.fechaHasta } : {}),
      incluirAnulados: query.incluirAnulados ?? false,
      ...(query.cuentaId !== undefined ? { cuentaId: query.cuentaId } : {}),
    });
  }

  @Get('mayor')
  @RequirePermissions('contabilidad.libro-mayor.read')
  @ApiOperation({
    summary:
      'Libro Mayor: vista por cuenta con saldo inicial, running balance y saldo final. ' +
      'Filtrar por periodoFiscalId O fechaDesde+fechaHasta. Filtro opcional por cuentaId. ' +
      'Tope: 20.000 movimientos (REQ-LM-12).',
  })
  obtenerLibroMayor(@Req() req: AuthenticatedRequest, @Query() query: LibroMayorQueryDto) {
    const tenantId = resolveTenantId(req);
    // exactOptionalPropertyTypes activo (CLAUDE.md §2.5.1): spread condicional
    // para campos opcionales del DTO.
    return this.libroMayorService.consultarLibroMayor(tenantId, {
      ...(query.cuentaId !== undefined ? { cuentaId: query.cuentaId } : {}),
      ...(query.periodoFiscalId !== undefined ? { periodoFiscalId: query.periodoFiscalId } : {}),
      ...(query.fechaDesde !== undefined ? { fechaDesde: query.fechaDesde } : {}),
      ...(query.fechaHasta !== undefined ? { fechaHasta: query.fechaHasta } : {}),
      incluirAnulados: query.incluirAnulados ?? false,
      soloConMovimiento: query.soloConMovimiento ?? true,
    });
  }
}
