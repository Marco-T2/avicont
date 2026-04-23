import { Injectable } from '@nestjs/common';
import { RedisService } from './redis.service';

@Injectable()
export class CacheService {
  private readonly DEFAULT_TTL = 300; // 5 minutes

  constructor(private readonly redis: RedisService) {}

  /**
   * Cache with tenant isolation - keys are prefixed with tenantId
   */
  async getTenantCache<T>(tenantId: string, key: string): Promise<T | null> {
    return this.redis.get<T>(`tenant:${tenantId}:${key}`);
  }

  async setTenantCache(
    tenantId: string,
    key: string,
    value: unknown,
    ttlSeconds = this.DEFAULT_TTL,
  ): Promise<void> {
    await this.redis.set(`tenant:${tenantId}:${key}`, value, ttlSeconds);
  }

  async invalidateTenantCache(tenantId: string, key: string): Promise<void> {
    await this.redis.del(`tenant:${tenantId}:${key}`);
  }

  async invalidateAllTenantCache(tenantId: string): Promise<void> {
    await this.redis.delPattern(`tenant:${tenantId}:*`);
  }

  /**
   * Global cache (not tenant-scoped)
   */
  async getGlobalCache<T>(key: string): Promise<T | null> {
    return this.redis.get<T>(`global:${key}`);
  }

  async setGlobalCache(key: string, value: unknown, ttlSeconds = this.DEFAULT_TTL): Promise<void> {
    await this.redis.set(`global:${key}`, value, ttlSeconds);
  }

  async invalidateGlobalCache(key: string): Promise<void> {
    await this.redis.del(`global:${key}`);
  }

  /**
   * Rate limiting helper
   */
  async checkRateLimit(
    identifier: string,
    limit: number,
    windowSeconds: number,
  ): Promise<{ allowed: boolean; remaining: number; resetIn: number }> {
    const key = `ratelimit:${identifier}`;
    const count = await this.redis.incr(key, windowSeconds);
    const ttl = await this.redis.getClient().ttl(`saas:${key}`);

    return {
      allowed: count <= limit,
      remaining: Math.max(0, limit - count),
      resetIn: ttl > 0 ? ttl : windowSeconds,
    };
  }
}
