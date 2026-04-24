import { Body, Controller, Delete, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiSecurity, ApiTags } from '@nestjs/swagger';

import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { RequirePermissions } from '../rbac/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../rbac/guards/permissions.guard';

import { CreateFeatureFlagDto, UpdateFeatureFlagDto } from './dto/feature-flag.dto';
import { FeatureFlagsService } from './feature-flags.service';

/**
 * Endpoints administrativos del catálogo GLOBAL de feature flags
 * (cross-tenant). Requieren `sistema.feature-flags.admin`.
 *
 * Hoy cualquier OWNER o ADMIN matchea este permiso vía el wildcard '*'
 * del rbac resolver. El modelo de super-admin global está sin formalizar
 * — ver `docs/deudas-arquitecturales.md §3.3`. Hasta entonces el caller
 * debe pasar un `X-Tenant-ID` válido (donde tiene OWNER/ADMIN) aunque
 * la operación sea cross-tenant; es fricción aceptada para evitar dejar
 * el endpoint completamente abierto.
 */
@ApiTags('Feature Flags (Admin)')
@ApiBearerAuth('JWT-auth')
@ApiSecurity('X-Tenant-ID')
@Controller('admin/feature-flags')
@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
@RequirePermissions('sistema.feature-flags.admin')
export class FeatureFlagsAdminController {
  constructor(private readonly featureFlagsService: FeatureFlagsService) {}

  @Get()
  @ApiOperation({ summary: 'List all global feature flags' })
  @ApiResponse({ status: 200, description: 'Global flags list' })
  async listGlobal() {
    return this.featureFlagsService.listGlobal();
  }

  @Post()
  @ApiOperation({ summary: 'Create a new global feature flag' })
  @ApiResponse({ status: 201, description: 'Global flag created' })
  async createGlobal(@Body() dto: CreateFeatureFlagDto) {
    return this.featureFlagsService.createGlobal(dto);
  }

  @Put(':key')
  @ApiOperation({ summary: 'Update a global feature flag' })
  @ApiResponse({ status: 200, description: 'Global flag updated' })
  async updateGlobal(@Param('key') key: string, @Body() dto: UpdateFeatureFlagDto) {
    return this.featureFlagsService.updateGlobal(key, dto);
  }

  @Post(':key/toggle')
  @ApiOperation({ summary: 'Toggle a global feature flag' })
  @ApiResponse({ status: 200, description: 'Flag toggled' })
  async toggleGlobal(@Param('key') key: string) {
    const enabled = await this.featureFlagsService.toggleGlobal(key);
    return { key, enabled };
  }

  @Delete(':key')
  @ApiOperation({ summary: 'Delete a global feature flag' })
  @ApiResponse({ status: 200, description: 'Global flag deleted' })
  async deleteGlobal(@Param('key') key: string) {
    await this.featureFlagsService.deleteGlobal(key);
    return { success: true };
  }
}
