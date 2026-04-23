import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PeriodoFiscalStatus } from '@prisma/client';

import { ForbiddenError } from '@/common/errors';
import { RequirePermissions } from '@/rbac/decorators/require-permissions.decorator';
import { PermissionsGuard } from '@/rbac/guards/permissions.guard';

import {
  SoloOwnerAdminPuedeReabrirError,
  SoloOwnerPuedeMarcarDefinitivoError,
} from './domain/errors';
import { ReabrirPeriodoDto } from './dto/reabrir-periodo.dto';
import { PeriodosFiscalesService } from './periodos-fiscales.service';

interface AuthenticatedRequest {
  user: { sub: string; activeTenantId?: string; roles?: string[] };
  headers: Record<string, string | string[] | undefined>;
}

function resolveTenantId(req: AuthenticatedRequest): string {
  const fromHeader = req.headers['x-tenant-id'];
  const tenantId =
    (Array.isArray(fromHeader) ? fromHeader[0] : fromHeader) ||
    req.user.activeTenantId;
  if (tenantId === undefined || tenantId === '') {
    throw new ForbiddenError(
      'TENANT_CONTEXT_REQUIRED',
      'Se requiere contexto de organización',
    );
  }
  return tenantId;
}

@ApiTags('Periodos Fiscales')
@ApiBearerAuth('JWT-auth')
@UseGuards(AuthGuard('jwt'), PermissionsGuard)
@Controller('periodos')
export class PeriodosFiscalesController {
  constructor(private readonly service: PeriodosFiscalesService) {}

  @Get()
  @RequirePermissions('contabilidad.periodos.read')
  @ApiOperation({
    summary: 'Listar períodos fiscales (filtros: gestionId, status)',
  })
  listar(
    @Req() req: AuthenticatedRequest,
    @Query('gestionId') gestionId?: string,
    @Query('status') status?: PeriodoFiscalStatus,
  ) {
    return this.service.listar(resolveTenantId(req), {
      ...(gestionId !== undefined ? { gestionId } : {}),
      ...(status !== undefined ? { status } : {}),
    });
  }

  @Get(':id')
  @RequirePermissions('contabilidad.periodos.read')
  @ApiOperation({ summary: 'Detalle de un período fiscal' })
  obtener(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.service.obtenerPorId(id, resolveTenantId(req));
  }

  @Get(':id/resumen-precierre')
  @RequirePermissions('contabilidad.periodos.read')
  @ApiOperation({
    summary:
      'Resumen de comprobantes (contabilizados, borradores, anulados) y totales antes de cerrar.',
  })
  resumen(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.service.obtenerResumenPrecierre(id, resolveTenantId(req));
  }

  @Post(':id/cerrar')
  @RequirePermissions('contabilidad.periodos.cerrar')
  @ApiOperation({
    summary:
      'Cerrar período fiscal (valida 0 borradores; bloquea los CONTABILIZADO).',
  })
  cerrar(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.service.cerrar(id, resolveTenantId(req), req.user.sub);
  }

  @Post(':id/reabrir')
  @RequirePermissions('contabilidad.periodos.reabrir')
  @ApiOperation({
    summary:
      'Reabrir período cerrado (solo OWNER/ADMIN, motivo ≥20 chars, auditado).',
  })
  reabrir(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: ReabrirPeriodoDto,
  ) {
    this.requireOwnerOrAdmin(req);
    return this.service.reabrir(
      id,
      resolveTenantId(req),
      req.user.sub,
      dto.motivo,
    );
  }

  @Post(':id/marcar-definitivo')
  @RequirePermissions('contabilidad.periodos.marcar-definitivo')
  @ApiOperation({
    summary: 'Marcar período cerrado como definitivo (solo OWNER, irreversible).',
  })
  marcarDefinitivo(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
  ) {
    this.requireOwner(req);
    return this.service.marcarDefinitivo(id, resolveTenantId(req));
  }

  // Chequeos de rol adicionales al RBAC genérico. El RBAC genérico valida el
  // permiso; acá forzamos que el rol sistema sea el correcto ignorando
  // cualquier custom role que tuviera el permiso de reabrir/bloquear por error.
  private requireOwnerOrAdmin(req: AuthenticatedRequest): void {
    const roles = req.user.roles ?? [];
    if (!roles.includes('OWNER') && !roles.includes('ADMIN')) {
      throw new SoloOwnerAdminPuedeReabrirError();
    }
  }

  private requireOwner(req: AuthenticatedRequest): void {
    const roles = req.user.roles ?? [];
    if (!roles.includes('OWNER')) {
      throw new SoloOwnerPuedeMarcarDefinitivoError();
    }
  }
}
