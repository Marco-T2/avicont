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
  async isEnabled(key: string, tenantId?: string): Promise<boolean> {
    // Check cache first
    const cacheKey = `feature:${key}`;
    if (tenantId) {
      const cachedTenant = await this.cache.getTenantCache<boolean>(tenantId, cacheKey);
      if (cachedTenant !== null) return cachedTenant;
    }

    // Check tenant-specific flag first
    if (tenantId) {
      const tenantFlag = await this.prisma.featureFlag.findUnique({
        where: { key_tenantId: { key, tenantId } },
      });

      if (tenantFlag) {
        await this.cache.setTenantCache(tenantId, cacheKey, tenantFlag.enabled, this.CACHE_TTL);
        return tenantFlag.enabled;
      }
    }

    // Fallback to global flag
    const globalFlag = await this.prisma.featureFlag.findFirst({
      where: { key, tenantId: null },
    });

    const enabled = globalFlag?.enabled ?? false;

    if (tenantId) {
      await this.cache.setTenantCache(tenantId, cacheKey, enabled, this.CACHE_TTL);
    }

    return enabled;
  }

  /**
   * Get all flags for a tenant (includes global flags with tenant overrides)
   */
  async getAllForTenant(tenantId: string): Promise<Record<string, boolean>> {
    const cacheKey = 'feature:all';
    const cached = await this.cache.getTenantCache<Record<string, boolean>>(tenantId, cacheKey);
    if (cached) return cached;

    // Get all global flags
    const globalFlags = await this.prisma.featureFlag.findMany({
      where: { tenantId: null },
    });

    // Get tenant-specific flags
    const tenantFlags = await this.prisma.featureFlag.findMany({
      where: { tenantId },
    });

    // Merge: tenant flags override global flags
    const result: Record<string, boolean> = {};

    for (const flag of globalFlags) {
      result[flag.key] = flag.enabled;
    }

    for (const flag of tenantFlags) {
      result[flag.key] = flag.enabled;
    }

    await this.cache.setTenantCache(tenantId, cacheKey, result, this.CACHE_TTL);
    return result;
  }

  /**
   * Create a global feature flag (admin only)
   */
  async createGlobal(dto: CreateFeatureFlagDto) {
    const existing = await this.prisma.featureFlag.findFirst({
      where: { key: dto.key, tenantId: null },
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
        tenantId: null,
      },
    });
  }

  /**
   * Create a tenant-specific override
   */
  async createTenantOverride(tenantId: string, dto: CreateFeatureFlagDto) {
    const existing = await this.prisma.featureFlag.findUnique({
      where: { key_tenantId: { key: dto.key, tenantId } },
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
        tenantId,
      },
    });

    // Invalidate cache
    await this.cache.invalidateTenantCache(tenantId, `feature:${dto.key}`);
    await this.cache.invalidateTenantCache(tenantId, 'feature:all');

    return flag;
  }

  /**
   * List all global flags
   */
  async listGlobal() {
    return this.prisma.featureFlag.findMany({
      where: { tenantId: null },
      orderBy: { key: 'asc' },
    });
  }

  /**
   * List all flags for a tenant (both tenant-specific and global)
   */
  async listForTenant(tenantId: string) {
    const [globalFlags, tenantFlags] = await Promise.all([
      this.prisma.featureFlag.findMany({
        where: { tenantId: null },
        orderBy: { key: 'asc' },
      }),
      this.prisma.featureFlag.findMany({
        where: { tenantId },
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
      where: { key, tenantId: null },
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
  async updateTenantOverride(tenantId: string, key: string, dto: UpdateFeatureFlagDto) {
    const flag = await this.prisma.featureFlag.findUnique({
      where: { key_tenantId: { key, tenantId } },
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
    await this.cache.invalidateTenantCache(tenantId, `feature:${key}`);
    await this.cache.invalidateTenantCache(tenantId, 'feature:all');

    return updated;
  }

  /**
   * Delete a global feature flag
   */
  async deleteGlobal(key: string) {
    const flag = await this.prisma.featureFlag.findFirst({
      where: { key, tenantId: null },
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
  async deleteTenantOverride(tenantId: string, key: string) {
    const flag = await this.prisma.featureFlag.findUnique({
      where: { key_tenantId: { key, tenantId } },
    });

    if (!flag) {
      throw new NotFoundException(`Feature flag '${key}' not found for this tenant`);
    }

    await this.prisma.featureFlag.delete({
      where: { id: flag.id },
    });

    // Invalidate cache
    await this.cache.invalidateTenantCache(tenantId, `feature:${key}`);
    await this.cache.invalidateTenantCache(tenantId, 'feature:all');
  }

  /**
   * Toggle a global feature flag
   */
  async toggleGlobal(key: string): Promise<boolean> {
    const flag = await this.prisma.featureFlag.findFirst({
      where: { key, tenantId: null },
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
  async toggleTenantOverride(tenantId: string, key: string): Promise<boolean> {
    const flag = await this.prisma.featureFlag.findUnique({
      where: { key_tenantId: { key, tenantId } },
    });

    if (!flag) {
      throw new NotFoundException(`Feature flag '${key}' not found for this tenant`);
    }

    const updated = await this.prisma.featureFlag.update({
      where: { id: flag.id },
      data: { enabled: !flag.enabled },
    });

    // Invalidate cache
    await this.cache.invalidateTenantCache(tenantId, `feature:${key}`);
    await this.cache.invalidateTenantCache(tenantId, 'feature:all');

    return updated.enabled;
  }
}
