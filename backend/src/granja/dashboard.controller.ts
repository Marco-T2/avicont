import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { RequireModule } from '@/common/decorators/require-module.decorator';
import { ForbiddenError } from '@/common/errors';
import { ModuleEnabledGuard } from '@/common/guards/module-enabled.guard';
import { RequirePermissions } from '@/rbac/decorators/require-permissions.decorator';
import { PermissionsGuard } from '@/rbac/guards/permissions.guard';

import { DashboardService } from './dashboard.service';
import { LoteDashboardItemDto, toLoteDashboardItem } from './dto/lote-dashboard-response.dto';

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

@ApiTags('Granja — Dashboard')
@ApiBearerAuth('JWT-auth')
@UseGuards(AuthGuard('jwt'), ModuleEnabledGuard, PermissionsGuard)
@RequireModule('granja')
@Controller('granja/dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get()
  @RequirePermissions('granja.dashboard.read')
  @ApiOperation({
    summary: 'Lotes ACTIVO con su resumen (costo por pollo vivo). 3 queries constantes (anti-N×2).',
  })
  async dashboard(@Req() req: AuthenticatedRequest): Promise<LoteDashboardItemDto[]> {
    const tenantId = resolveTenantId(req);
    const lotes = await this.dashboardService.lotesActivosConResumen(tenantId);
    return lotes.map(toLoteDashboardItem);
  }
}
