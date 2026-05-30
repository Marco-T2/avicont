import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { RequireModule } from '@/common/decorators/require-module.decorator';
import { ForbiddenError } from '@/common/errors';
import { ModuleEnabledGuard } from '@/common/guards/module-enabled.guard';
import { RequirePermissions } from '@/rbac/decorators/require-permissions.decorator';
import { PermissionsGuard } from '@/rbac/guards/permissions.guard';

import { LibroDiarioQueryDto } from './dto/libro-diario-query.dto';
import { LibroDiarioService } from './libro-diario.service';

// ---- Resolución de tenantId desde JWT + header opcional (mismo patrón que comprobantes) ----

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

@ApiTags('Libros contables')
@ApiBearerAuth('JWT-auth')
@UseGuards(AuthGuard('jwt'), ModuleEnabledGuard, PermissionsGuard)
@RequireModule('contabilidad')
@Controller('libros')
export class ReportesController {
  constructor(private readonly libroDiarioService: LibroDiarioService) {}

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
    });
  }
}
