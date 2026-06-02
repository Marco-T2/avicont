import { Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { SystemRole } from '@prisma/client';

import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { RequireSystemRole } from '@/common/decorators/require-system-role.decorator';
import { ForbiddenError } from '@/common/errors';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { SystemRolesGuard } from '@/common/guards/system-roles.guard';

import { ActivarPackDto } from './dto/activar-pack.dto';
import {
  ActivacionPackResponseDto,
  toActivacionPackResponse,
} from './dto/activacion-pack-response.dto';
import {
  OrgPackEntitlementResponseDto,
  toOrgPackEntitlementResponse,
} from './dto/org-pack-entitlement-response.dto';
import { PackService } from './pack.service';

interface JwtUser {
  sub: string;
  activeTenantId?: string;
}

/**
 * Endpoints del Owner/ADMIN para activar/desactivar los packs que la plataforma
 * habilitó a su org (diseño `docs/disenos/packs-eje2.md` §5.4). Gateado por
 * SystemRole OWNER/ADMIN — NO por un permiso fino del catálogo (la activación de
 * un pack contratado es gobierno del rol del sistema, no un permiso asignable).
 *
 * Opera siempre sobre `req.user.activeTenantId` (la org del JWT). El service
 * valida la frontera de oro activación⊆entitlement (§4.5): no se puede activar lo
 * que la plataforma no habilitó.
 *
 * Ortogonalidad org-status (regla 3 §8): si la org está SUSPENDED/ARCHIVED, el
 * `OrgStatusGuard` global ya bloquea este PATCH (mutación) con 403 ORG_STATUS_NO_ACTIVE
 * — cadena independiente, no se replica aquí.
 */
@ApiTags('Packs')
@ApiBearerAuth('JWT-auth')
@Controller('packs')
@UseGuards(JwtAuthGuard, SystemRolesGuard)
@RequireSystemRole(SystemRole.OWNER, SystemRole.ADMIN)
export class PackController {
  constructor(private readonly packs: PackService) {}

  @Get('mis-packs')
  @ApiOperation({ summary: 'Listar los packs habilitados de la org con su estado de activación' })
  @ApiOkResponse({ type: [OrgPackEntitlementResponseDto] })
  async misPacks(@CurrentUser() user: JwtUser): Promise<OrgPackEntitlementResponseDto[]> {
    const orgId = this.requireTenant(user);
    const entitlements = await this.packs.listarMisPacks(orgId);
    return entitlements.map(toOrgPackEntitlementResponse);
  }

  @Patch(':clave')
  @ApiOperation({ summary: 'Activar o desactivar un pack habilitado de la org activa' })
  @ApiOkResponse({ type: ActivacionPackResponseDto })
  @ApiResponse({ status: 403, description: 'Pack no habilitado para la org (PACK_NO_HABILITADO)' })
  @ApiResponse({ status: 404, description: 'Pack inexistente en el catálogo' })
  async activar(
    @Param('clave') clave: string,
    @Body() dto: ActivarPackDto,
    @CurrentUser() user: JwtUser,
  ): Promise<ActivacionPackResponseDto> {
    const orgId = this.requireTenant(user);
    const entitlement = await this.packs.activarPorClave(orgId, clave, dto.activo);
    return toActivacionPackResponse(entitlement);
  }

  private requireTenant(user: JwtUser): string {
    if (!user.activeTenantId) {
      throw new ForbiddenError('PACK_SIN_CONTEXTO_ORG', 'Se requiere contexto de organización');
    }
    return user.activeTenantId;
  }
}
