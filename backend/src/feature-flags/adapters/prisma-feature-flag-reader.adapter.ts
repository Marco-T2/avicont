import { Injectable, Logger } from '@nestjs/common';

import { CacheService } from '@/cache/cache.service';
import { PrismaService } from '@/common/prisma.service';

import { FeatureFlagReaderPort } from '../ports/feature-flag-reader.port';

// TTL corto para que un toggle desde admin se refleje rápido. Cualquier
// mutación contra DB invalida explícitamente via `invalidate(...)`, así
// que este TTL es sólo la cota superior para escenarios de falla de
// invalidación (p.ej. Redis caído al momento del commit).
const CACHE_TTL_SECONDS = 60;

const keyFlag = (flagKey: string): string => `feature:${flagKey}`;
const KEY_ALL = 'feature:all';

/**
 * Implementación del reader port. Única ruta de lectura del estado
 * efectivo de una feature flag — tanto para el guard como para los
 * endpoints `GET /feature-flags` y `GET /feature-flags/:key/check`.
 *
 * Resiliencia contra Redis caído (CLAUDE.md §6.6):
 * - `isEnabled` / `getAllForTenant`: si el GET falla, log warn y se cae
 *   a Prisma. El SET posterior también es tolerante a fallo.
 * - `invalidate`: tolera errores de Redis. Si falla, el peor caso es
 *   cache stale hasta el TTL — nunca rompe el flujo del service, que
 *   ya commiteó a DB antes de llamar acá.
 */
@Injectable()
export class PrismaFeatureFlagReaderAdapter extends FeatureFlagReaderPort {
  private readonly logger = new Logger(PrismaFeatureFlagReaderAdapter.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {
    super();
  }

  async isEnabled(key: string, organizationId?: string): Promise<boolean> {
    if (organizationId) {
      const cached = await this.safeGet<boolean>(organizationId, keyFlag(key));
      if (cached !== null) return cached;
    }

    const enabled = await this.resolveFromDb(key, organizationId);

    if (organizationId) {
      await this.safeSet(organizationId, keyFlag(key), enabled);
    }

    return enabled;
  }

  async getAllForTenant(organizationId: string): Promise<Record<string, boolean>> {
    const cached = await this.safeGet<Record<string, boolean>>(organizationId, KEY_ALL);
    if (cached !== null) return cached;

    const [globalFlags, tenantFlags] = await Promise.all([
      this.prisma.featureFlag.findMany({
        where: { organizationId: null },
        select: { key: true, enabled: true },
      }),
      this.prisma.featureFlag.findMany({
        where: { organizationId },
        select: { key: true, enabled: true },
      }),
    ]);

    const result: Record<string, boolean> = {};
    for (const flag of globalFlags) result[flag.key] = flag.enabled;
    for (const flag of tenantFlags) result[flag.key] = flag.enabled; // override

    await this.safeSet(organizationId, KEY_ALL, result);
    return result;
  }

  async invalidate(organizationId: string, key: string): Promise<void> {
    try {
      await Promise.all([
        this.cache.invalidateTenantCache(organizationId, keyFlag(key)),
        this.cache.invalidateTenantCache(organizationId, KEY_ALL),
      ]);
    } catch (err) {
      // Post-commit: el mutate ya está en DB. Cache stale hasta TTL es
      // aceptable; romper el flujo de negocio NO.
      this.logger.warn(
        `Cache invalidate failed for tenant=${organizationId} key=${key} ` +
          `(${(err as Error).message}); entry will expire via TTL`,
      );
    }
  }

  private async resolveFromDb(key: string, organizationId?: string): Promise<boolean> {
    if (organizationId) {
      const override = await this.prisma.featureFlag.findUnique({
        where: { key_organizationId: { key, organizationId } },
        select: { enabled: true },
      });
      if (override) return override.enabled;
    }

    const global = await this.prisma.featureFlag.findFirst({
      where: { key, organizationId: null },
      select: { enabled: true },
    });
    return global?.enabled ?? false;
  }

  private async safeGet<T>(organizationId: string, cacheKey: string): Promise<T | null> {
    try {
      return await this.cache.getTenantCache<T>(organizationId, cacheKey);
    } catch (err) {
      this.logger.warn(
        `Cache GET failed for tenant=${organizationId} key=${cacheKey} ` +
          `(${(err as Error).message}); falling back to DB`,
      );
      return null;
    }
  }

  private async safeSet(
    organizationId: string,
    cacheKey: string,
    value: unknown,
  ): Promise<void> {
    try {
      await this.cache.setTenantCache(organizationId, cacheKey, value, CACHE_TTL_SECONDS);
    } catch (err) {
      this.logger.warn(
        `Cache SET failed for tenant=${organizationId} key=${cacheKey} ` +
          `(${(err as Error).message}); skipping`,
      );
    }
  }
}
