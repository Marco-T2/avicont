import { Controller, Get, Post, Put, Delete, Param, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiSecurity } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { PermissionsGuard } from '../rbac/guards/permissions.guard';
import { RequirePermissions } from '../rbac/decorators/require-permissions.decorator';
import { CurrentTenant } from '../common/decorators/current-tenant.decorator';
import { FeatureFlagsService } from './feature-flags.service';
import { CreateFeatureFlagDto, UpdateFeatureFlagDto } from './dto/feature-flag.dto';

@ApiTags('Feature Flags')
@ApiBearerAuth('JWT-auth')
@ApiSecurity('X-Tenant-ID')
@Controller('feature-flags')
@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
export class FeatureFlagsController {
  constructor(private readonly featureFlagsService: FeatureFlagsService) {}

  @Get()
  @ApiOperation({ summary: 'Get all feature flags for current tenant' })
  @ApiResponse({ status: 200, description: 'Map of feature flag states' })
  async getAllFlags(@CurrentTenant() tenantId: string) {
    return this.featureFlagsService.getAllForTenant(tenantId);
  }

  @Get('list')
  @RequirePermissions('settings.read')
  @ApiOperation({ summary: 'List flags with details (global vs overrides)' })
  @ApiResponse({ status: 200, description: 'Detailed flag list' })
  async listFlags(@CurrentTenant() tenantId: string) {
    return this.featureFlagsService.listForTenant(tenantId);
  }

  @Get(':key/check')
  @ApiOperation({ summary: 'Check if a specific feature is enabled' })
  @ApiResponse({ status: 200, description: 'Feature enabled status' })
  async checkFlag(@CurrentTenant() tenantId: string, @Param('key') key: string) {
    const enabled = await this.featureFlagsService.isEnabled(key, tenantId);
    return { key, enabled };
  }

  @Post('overrides')
  @RequirePermissions('settings.write')
  @ApiOperation({ summary: 'Create a tenant-specific flag override' })
  @ApiResponse({ status: 201, description: 'Override created' })
  async createOverride(@CurrentTenant() tenantId: string, @Body() dto: CreateFeatureFlagDto) {
    return this.featureFlagsService.createTenantOverride(tenantId, dto);
  }

  @Put('overrides/:key')
  @RequirePermissions('settings.write')
  @ApiOperation({ summary: 'Update a tenant-specific flag override' })
  @ApiResponse({ status: 200, description: 'Override updated' })
  async updateOverride(
    @CurrentTenant() tenantId: string,
    @Param('key') key: string,
    @Body() dto: UpdateFeatureFlagDto,
  ) {
    return this.featureFlagsService.updateTenantOverride(tenantId, key, dto);
  }

  @Post('overrides/:key/toggle')
  @RequirePermissions('settings.write')
  @ApiOperation({ summary: 'Toggle a tenant-specific flag' })
  @ApiResponse({ status: 200, description: 'Flag toggled' })
  async toggleOverride(@CurrentTenant() tenantId: string, @Param('key') key: string) {
    const enabled = await this.featureFlagsService.toggleTenantOverride(tenantId, key);
    return { key, enabled };
  }

  @Delete('overrides/:key')
  @RequirePermissions('settings.write')
  @ApiOperation({ summary: 'Delete tenant override (falls back to global)' })
  @ApiResponse({ status: 200, description: 'Override deleted' })
  async deleteOverride(@CurrentTenant() tenantId: string, @Param('key') key: string) {
    await this.featureFlagsService.deleteTenantOverride(tenantId, key);
    return { success: true };
  }
}
