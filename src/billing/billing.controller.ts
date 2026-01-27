import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiSecurity } from '@nestjs/swagger';
import { BillingService } from './billing.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { PermissionsGuard } from '../rbac/guards/permissions.guard';
import { RequirePermissions } from '../rbac/decorators/require-permissions.decorator';
import { CurrentTenant } from '../common/decorators/current-tenant.decorator';

@ApiTags('Billing')
@ApiBearerAuth('JWT-auth')
@ApiSecurity('X-Tenant-ID')
@Controller('billing')
@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  @Get()
  @RequirePermissions('billing.read')
  @ApiOperation({ summary: 'Get billing overview for current tenant' })
  @ApiResponse({ status: 200, description: 'Billing overview with subscription info' })
  async getOverview(@CurrentTenant() tenantId: string) {
    return this.billingService.getBillingOverview(tenantId);
  }

  @Get('limits')
  @RequirePermissions('billing.read')
  @ApiOperation({ summary: 'Get plan limits for current tenant' })
  @ApiResponse({ status: 200, description: 'Plan limits and features' })
  async getLimits(@CurrentTenant() tenantId: string) {
    return this.billingService.getPlanLimits(tenantId);
  }

  @Get('quota/:resource')
  @RequirePermissions('billing.read')
  @ApiOperation({ summary: 'Check quota for a specific resource' })
  @ApiResponse({ status: 200, description: 'Quota status' })
  async checkQuota(@CurrentTenant() tenantId: string, @Param('resource') resource: string) {
    return this.billingService.checkQuota(tenantId, resource);
  }
}
