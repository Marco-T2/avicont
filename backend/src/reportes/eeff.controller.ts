import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { RequireModule } from '@/common/decorators/require-module.decorator';
import { ModuleEnabledGuard } from '@/common/guards/module-enabled.guard';
import { RequirePermissions } from '@/rbac/decorators/require-permissions.decorator';
import { PermissionsGuard } from '@/rbac/guards/permissions.guard';

import { BalanceGeneralService } from './balance-general.service';
import { BalanceQueryDto } from './dto/balance-query.dto';
import { resolveTenantId } from './tenant-id';
import type { AuthenticatedRequest } from './tenant-id';

/**
 * Controller de Estados Financieros (EEFF).
 *
 * Separado de ReportesController (@Controller('libros')) porque los EEFF
 * son una familia distinta de los Libros Contables.
 * Change 4 sumará GET /eeff/resultados al mismo EeffController.
 *
 * RBAC: contabilidad.eeff.read (REQ-BG-13).
 */
@ApiTags('Estados Financieros')
@ApiBearerAuth('JWT-auth')
@UseGuards(AuthGuard('jwt'), ModuleEnabledGuard, PermissionsGuard)
@RequireModule('contabilidad')
@Controller('eeff')
export class EeffController {
  constructor(private readonly balanceGeneralService: BalanceGeneralService) {}

  @Get('balance')
  @RequirePermissions('contabilidad.eeff.read')
  @ApiOperation({
    summary:
      'Balance General: Estado de Situación Financiera a una fecha de corte. ' +
      'Requiere fecha=YYYY-MM-DD. Presenta Activo, Pasivo y Patrimonio con Resultado del Ejercicio. ' +
      'REQ-BG-01..15.',
  })
  obtenerBalanceGeneral(
    @Req() req: AuthenticatedRequest,
    @Query() query: BalanceQueryDto,
  ) {
    const tenantId = resolveTenantId(req);
    // exactOptionalPropertyTypes activo (CLAUDE.md §2.5.1): spread condicional
    // para campos opcionales del DTO.
    return this.balanceGeneralService.consultarBalanceGeneral(tenantId, {
      fecha: query.fecha,
      ...(query.gestionId !== undefined ? { gestionId: query.gestionId } : {}),
      incluirAnulados: query.incluirAnulados ?? false,
    });
  }
}
