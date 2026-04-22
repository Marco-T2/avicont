import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { CacheService } from '../cache/cache.service';
import { CreateFeatureFlagDto, UpdateFeatureFlagDto } from './dto/feature-flag.dto';
import { Prisma } from '@prisma/client';

@Injectable()
export class FeatureFlagsService {
  private readonly CACHE_TTL = 60; // 1 minute cache for feature flags

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  /**
   * Check if a feature is enabled for a tenant
   * First checks tenant-specific flags, then falls back to global flags
   */
  async isEnabled(key: string, organizationId?: string): Promise<boolean> {
    // Check cache first
    const cacheKey = `feature:${key}`;
    if (organizationId) {
      const cachedTenant = await this.cache.getTenantCache<boolean>(organizationId, cacheKey);
      if (cachedTenant !== null) return cachedTenant;
    }

    // Check tenant-specific flag first
    if (organizationId) {
      const tenantFlag = await this.prisma.featureFlag.findUnique({
        where: { key_organizationId: { key, organizationId } },
      });

      if (tenantFlag) {
        await this.cache.setTenantCache(organizationId, cacheKey, tenantFlag.enabled, this.CACHE_TTL);
        return tenantFlag.enabled;
      }
    }

    // Fallback to global flag
    const globalFlag = await this.prisma.featureFlag.findFirst({
      where: { key, organizationId: null },
    });

    const enabled = globalFlag?.enabled ?? false;

    if (organizationId) {
      await this.cache.setTenantCache(organizationId, cacheKey, enabled, this.CACHE_TTL);
    }

    return enabled;
  }

  /**
   * Get all flags for a tenant (includes global flags with tenant overrides)
   */
  async getAllForTenant(organizationId: string): Promise<Record<string, boolean>> {
    const cacheKey = 'feature:all';
    const cached = await this.cache.getTenantCache<Record<string, boolean>>(organizationId, cacheKey);
    if (cached) return cached;

    // Get all global flags
    const globalFlags = await this.prisma.featureFlag.findMany({
      where: { organizationId: null },
    });

    // Get tenant-specific flags
    const tenantFlags = await this.prisma.featureFlag.findMany({
      where: { organizationId },
    });

    // Merge: tenant flags override global flags
    const result: Record<string, boolean> = {};

    for (const flag of globalFlags) {
      result[flag.key] = flag.enabled;
    }

    for (const flag of tenantFlags) {
      result[flag.key] = flag.enabled;
    }

    await this.cache.setTenantCache(organizationId, cacheKey, result, this.CACHE_TTL);
    return result;
  }

  /**
   * Create a global feature flag (admin only)
   */
  async createGlobal(dto: CreateFeatureFlagDto) {
    const existing = await this.prisma.featureFlag.findFirst({
      where: { key: dto.key, organizationId: null },
    });

    if (existing) {
      throw new ConflictException(`Global feature flag '${dto.key}' already exists`);
    }

    return this.prisma.featureFlag.create({
      data: {
        key: dto.key,
        name: dto.name,
        description: dto.description,
        enabled: dto.enabled ?? false,
        metadata: (dto.metadata as Prisma.InputJsonValue) ?? Prisma.JsonNull,
        organizationId: null,
      },
    });
  }

  /**
   * Create a tenant-specific override
   */
  async createTenantOverride(organizationId: string, dto: CreateFeatureFlagDto) {
    const existing = await this.prisma.featureFlag.findUnique({
      where: { key_organizationId: { key: dto.key, organizationId } },
    });

    if (existing) {
      throw new ConflictException(`Feature flag '${dto.key}' already exists for this tenant`);
    }

    const flag = await this.prisma.featureFlag.create({
      data: {
        key: dto.key,
        name: dto.name,
        description: dto.description,
        enabled: dto.enabled ?? false,
        metadata: (dto.metadata as Prisma.InputJsonValue) ?? Prisma.JsonNull,
        organizationId,
      },
    });

    // Invalidate cache
    await this.cache.invalidateTenantCache(organizationId, `feature:${dto.key}`);
    await this.cache.invalidateTenantCache(organizationId, 'feature:all');

    return flag;
  }

  /**
   * List all global flags
   */
  async listGlobal() {
    return this.prisma.featureFlag.findMany({
      where: { organizationId: null },
      orderBy: { key: 'asc' },
    });
  }

  /**
   * List all flags for a tenant (both tenant-specific and global)
   */
  async listForTenant(organizationId: string) {
    const [globalFlags, tenantFlags] = await Promise.all([
      this.prisma.featureFlag.findMany({
        where: { organizationId: null },
        orderBy: { key: 'asc' },
      }),
      this.prisma.featureFlag.findMany({
        where: { organizationId },
        orderBy: { key: 'asc' },
      }),
    ]);

    const tenantFlagKeys = new Set(tenantFlags.map((f: { key: string }) => f.key));

    return {
      global: globalFlags.filter((f: { key: string }) => !tenantFlagKeys.has(f.key)),
      overrides: tenantFlags,
    };
  }

  /**
   * Update a global feature flag
   */
  async updateGlobal(key: string, dto: UpdateFeatureFlagDto) {
    const flag = await this.prisma.featureFlag.findFirst({
      where: { key, organizationId: null },
    });

    if (!flag) {
      throw new NotFoundException(`Global feature flag '${key}' not found`);
    }

    return this.prisma.featureFlag.update({
      where: { id: flag.id },
      data: {
        name: dto.name,
        description: dto.description,
        enabled: dto.enabled,
        metadata: dto.metadata ? (dto.metadata as Prisma.InputJsonValue) : undefined,
      },
    });
  }

  /**
   * Update a tenant-specific flag
   */
  async updateTenantOverride(organizationId: string, key: string, dto: UpdateFeatureFlagDto) {
    const flag = await this.prisma.featureFlag.findUnique({
      where: { key_organizationId: { key, organizationId } },
    });

    if (!flag) {
      throw new NotFoundException(`Feature flag '${key}' not found for this tenant`);
    }

    const updated = await this.prisma.featureFlag.update({
      where: { id: flag.id },
      data: {
        name: dto.name,
        description: dto.description,
        enabled: dto.enabled,
        metadata: dto.metadata ? (dto.metadata as Prisma.InputJsonValue) : undefined,
      },
    });

    // Invalidate cache
    await this.cache.invalidateTenantCache(organizationId, `feature:${key}`);
    await this.cache.invalidateTenantCache(organizationId, 'feature:all');

    return updated;
  }

  /**
   * Delete a global feature flag
   */
  async deleteGlobal(key: string) {
    const flag = await this.prisma.featureFlag.findFirst({
      where: { key, organizationId: null },
    });

    if (!flag) {
      throw new NotFoundException(`Global feature flag '${key}' not found`);
    }

    await this.prisma.featureFlag.delete({
      where: { id: flag.id },
    });
  }

  /**
   * Delete a tenant-specific override
   */
  async deleteTenantOverride(organizationId: string, key: string) {
    const flag = await this.prisma.featureFlag.findUnique({
      where: { key_organizationId: { key, organizationId } },
    });

    if (!flag) {
      throw new NotFoundException(`Feature flag '${key}' not found for this tenant`);
    }

    await this.prisma.featureFlag.delete({
      where: { id: flag.id },
    });

    // Invalidate cache
    await this.cache.invalidateTenantCache(organizationId, `feature:${key}`);
    await this.cache.invalidateTenantCache(organizationId, 'feature:all');
  }

  /**
   * Toggle a global feature flag
   */
  async toggleGlobal(key: string): Promise<boolean> {
    const flag = await this.prisma.featureFlag.findFirst({
      where: { key, organizationId: null },
    });

    if (!flag) {
      throw new NotFoundException(`Global feature flag '${key}' not found`);
    }

    const updated = await this.prisma.featureFlag.update({
      where: { id: flag.id },
      data: { enabled: !flag.enabled },
    });

    return updated.enabled;
  }

  /**
   * Toggle a tenant-specific flag
   */
  async toggleTenantOverride(organizationId: string, key: string): Promise<boolean> {
    const flag = await this.prisma.featureFlag.findUnique({
      where: { key_organizationId: { key, organizationId } },
    });

    if (!flag) {
      throw new NotFoundException(`Feature flag '${key}' not found for this tenant`);
    }

    const updated = await this.prisma.featureFlag.update({
      where: { id: flag.id },
      data: { enabled: !flag.enabled },
    });

    // Invalidate cache
    await this.cache.invalidateTenantCache(organizationId, `feature:${key}`);
    await this.cache.invalidateTenantCache(organizationId, 'feature:all');

    return updated.enabled;
  }
}
