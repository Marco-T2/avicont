import { Body, Controller, Delete, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { SuperAdminGuard } from '../common/guards/super-admin.guard';

import { CreateFeatureFlagDto, UpdateFeatureFlagDto } from './dto/feature-flag.dto';
import { FeatureFlagsService } from './feature-flags.service';

/**
 * Endpoints administrativos del catálogo GLOBAL de feature flags (cross-tenant).
 *
 * Re-gateado en Slice 6b (REQ-SA-16): antes requería `sistema.feature-flags.admin`
 * vía RBAC wildcard (cualquier OWNER/ADMIN lo matcheaba con X-Tenant-ID).
 * Ahora requiere `isSuperAdmin === true` en el JWT — solo el super-admin de
 * plataforma puede gestionar los feature flags globales del sistema.
 *
 * Sin TenantGuard: operación org-less, el catálogo global no pertenece a un tenant.
 */
@ApiTags('Feature Flags (Admin)')
@ApiBearerAuth('JWT-auth')
@Controller('admin/feature-flags')
@UseGuards(JwtAuthGuard, SuperAdminGuard)
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
