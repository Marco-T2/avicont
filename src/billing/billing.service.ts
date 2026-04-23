import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { TenantContextService } from '../common/tenant-context/tenant-context.service';
import { DEFAULT_PLAN_LIMITS } from './interfaces/quota-checker.interface';

@Injectable()
export class BillingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
  ) {}

  async getTenantPlan(tenantId: string) {
    const tenant = await this.prisma.organization.findUnique({
      where: { id: tenantId },
      select: { id: true, plan: true, status: true },
    });
    return tenant;
  }

  async getPlanLimits(tenantId: string) {
    const tenant = await this.getTenantPlan(tenantId);
    if (!tenant) {
      return null;
    }
    const plan = tenant.plan as 'FREE' | 'PRO';
    return DEFAULT_PLAN_LIMITS[plan];
  }

  async checkQuota(tenantId: string, resource: string) {
    const limits = await this.getPlanLimits(tenantId);
    if (!limits || !(resource in limits)) {
      return { allowed: true, current: 0, limit: Infinity };
    }

    const limit = limits[resource];
    if (limit === undefined) {
      return { allowed: true, current: 0, limit: Infinity };
    }
    const current = await this.getCurrentUsage(tenantId, resource);

    const exceeds = current >= limit;
    return exceeds
      ? {
          allowed: false,
          current,
          limit,
          message: `${resource} limit reached for your plan`,
        }
      : { allowed: true, current, limit };
  }

  async getCurrentUsage(tenantId: string, resource: string): Promise<number> {
    // Example implementation - customize per resource type
    switch (resource) {
      case 'members':
        return this.prisma.membership.count({ where: { organizationId: tenantId } });
      default:
        return 0;
    }
  }

  async upgradePlan(tenantId: string, plan: 'FREE' | 'PRO') {
    // In production, this would integrate with BillingProvider
    return this.prisma.organization.update({
      where: { id: tenantId },
      data: { plan },
    });
  }

  async getBillingOverview(tenantId: string) {
    const tenant = await this.getTenantPlan(tenantId);
    const limits = await this.getPlanLimits(tenantId);
    const memberCount = await this.prisma.membership.count({
      where: { organizationId: tenantId },
    });

    return {
      plan: tenant?.plan,
      status: tenant?.status,
      usage: {
        members: {
          current: memberCount,
          limit: limits?.members ?? Infinity,
        },
      },
    };
  }
}
