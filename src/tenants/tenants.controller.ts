import { Controller, Post, Get, Patch, Param, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiSecurity } from '@nestjs/swagger';
import { TenantsService } from './tenants.service';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { UpdateTenantDto } from './dto/update-tenant.dto';
import { UpdateFeaturesDto } from './dto/update-features.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CurrentTenant } from '../common/decorators/current-tenant.decorator';
import { PermissionsGuard } from '../rbac/guards/permissions.guard';
import { RequirePermissions } from '../rbac/decorators/require-permissions.decorator';

@ApiTags('Tenants')
@ApiBearerAuth('JWT-auth')
@Controller('tenants')
@UseGuards(JwtAuthGuard)
export class TenantsController {
  constructor(private readonly tenantsService: TenantsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new tenant/organization' })
  @ApiResponse({ status: 201, description: 'Tenant created successfully' })
  @ApiResponse({ status: 409, description: 'Slug already exists' })
  async create(@CurrentUser() user: { sub: string }, @Body() dto: CreateTenantDto) {
    return this.tenantsService.create(dto, user.sub);
  }

  @Get('current')
  @UseGuards(TenantGuard)
  @ApiSecurity('X-Tenant-ID')
  @ApiOperation({ summary: 'Get current tenant details' })
  @ApiResponse({ status: 200, description: 'Tenant details' })
  async getCurrent(@CurrentTenant() tenantId: string) {
    return this.tenantsService.findById(tenantId);
  }

  @Patch('current')
  @UseGuards(TenantGuard)
  @ApiSecurity('X-Tenant-ID')
  @ApiOperation({ summary: 'Update current tenant' })
  @ApiResponse({ status: 200, description: 'Tenant updated' })
  async updateCurrent(@CurrentTenant() tenantId: string, @Body() dto: UpdateTenantDto) {
    return this.tenantsService.update(tenantId, dto);
  }

  @Get('current/members')
  @UseGuards(TenantGuard)
  @ApiSecurity('X-Tenant-ID')
  @ApiOperation({ summary: 'Get all members of the current tenant' })
  @ApiResponse({ status: 200, description: 'List of members' })
  async getMembers(@CurrentTenant() tenantId: string) {
    return this.tenantsService.getMembers(tenantId);
  }

  @Get('current/features')
  @UseGuards(TenantGuard, PermissionsGuard)
  @RequirePermissions('organizacion.feature-flags.read')
  @ApiSecurity('X-Tenant-ID')
  @ApiOperation({ summary: 'Get feature flags (modules enabled) of current tenant' })
  async getFeatures(@CurrentTenant() tenantId: string) {
    return this.tenantsService.getFeatures(tenantId);
  }

  @Patch('current/features')
  @UseGuards(TenantGuard, PermissionsGuard)
  @RequirePermissions('organizacion.feature-flags.update')
  @ApiSecurity('X-Tenant-ID')
  @ApiOperation({ summary: 'Toggle feature flags (modules) of current tenant' })
  async updateFeatures(@CurrentTenant() tenantId: string, @Body() dto: UpdateFeaturesDto) {
    return this.tenantsService.updateFeatures(tenantId, dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get tenant by ID' })
  @ApiResponse({ status: 200, description: 'Tenant details' })
  @ApiResponse({ status: 404, description: 'Tenant not found' })
  async findById(@Param('id') id: string) {
    return this.tenantsService.findById(id);
  }

  @Get('slug/:slug')
  @ApiOperation({ summary: 'Get tenant by slug' })
  @ApiResponse({ status: 200, description: 'Tenant details' })
  @ApiResponse({ status: 404, description: 'Tenant not found' })
  async findBySlug(@Param('slug') slug: string) {
    return this.tenantsService.findBySlug(slug);
  }
}
