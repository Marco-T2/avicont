import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import {
  FeatureFlagDuplicadaError,
  FeatureFlagNoEncontradaError,
} from './domain/feature-flag-errors';
import { FeatureFlagKey } from './domain/feature-flag-key';
import { CreateFeatureFlagDto, UpdateFeatureFlagDto } from './dto/feature-flag.dto';
import {
  FEATURE_FLAG_READER_PORT,
  type FeatureFlagReaderPort,
} from './ports/feature-flag-reader.port';
import {
  FEATURE_FLAG_REPOSITORY_PORT,
  type FeatureFlagRepositoryPort,
} from './ports/feature-flag.repository.port';

/**
 * Flujos administrativos del catálogo de feature flags (global + overrides
 * por tenant). Las lecturas (`isEnabled`, `getAllForTenant`) NO viven acá:
 * están en `FEATURE_FLAG_READER_PORT`, que es además el dueño del cache.
 *
 * Patrón de invalidación: cada mutación con alcance tenant commitea a DB
 * via `repo` y recién después llama `reader.invalidate(...)`. Si la
 * invalidación falla (Redis caído) el reader lo absorbe — el negocio no
 * se rompe, el cache expira por TTL.
 */
@Injectable()
export class FeatureFlagsService {
  constructor(
    @Inject(FEATURE_FLAG_REPOSITORY_PORT)
    private readonly repo: FeatureFlagRepositoryPort,
    @Inject(FEATURE_FLAG_READER_PORT)
    private readonly reader: FeatureFlagReaderPort,
  ) {}

  // ============================================================
  // Catálogo global
  // ============================================================

  async createGlobal(dto: CreateFeatureFlagDto) {
    const key = FeatureFlagKey.of(dto.key).toString();
    const existing = await this.repo.findGlobal(key);
    if (existing) {
      throw new FeatureFlagDuplicadaError(key, null);
    }
    return this.repo.create({
      key,
      name: dto.name,
      ...(dto.description !== undefined ? { description: dto.description } : {}),
      enabled: dto.enabled ?? false,
      metadata: (dto.metadata as Prisma.InputJsonValue) ?? Prisma.JsonNull,
      organizationId: null,
    });
  }

  async listGlobal() {
    return this.repo.listGlobal();
  }

  async updateGlobal(rawKey: string, dto: UpdateFeatureFlagDto) {
    const key = FeatureFlagKey.of(rawKey).toString();
    const flag = await this.repo.findGlobal(key);
    if (!flag) {
      throw new FeatureFlagNoEncontradaError(key, null);
    }
    return this.repo.update(flag.id, {
      ...(dto.name !== undefined ? { name: dto.name } : {}),
      ...(dto.description !== undefined ? { description: dto.description } : {}),
      ...(dto.enabled !== undefined ? { enabled: dto.enabled } : {}),
      ...(dto.metadata !== undefined ? { metadata: dto.metadata as Prisma.InputJsonValue } : {}),
    });
  }

  async deleteGlobal(rawKey: string): Promise<void> {
    const key = FeatureFlagKey.of(rawKey).toString();
    const flag = await this.repo.findGlobal(key);
    if (!flag) {
      throw new FeatureFlagNoEncontradaError(key, null);
    }
    await this.repo.delete(flag.id);
  }

  async toggleGlobal(rawKey: string): Promise<boolean> {
    const key = FeatureFlagKey.of(rawKey).toString();
    const flag = await this.repo.findGlobal(key);
    if (!flag) {
      throw new FeatureFlagNoEncontradaError(key, null);
    }
    const updated = await this.repo.update(flag.id, { enabled: !flag.enabled });
    return updated.enabled;
  }

  // ============================================================
  // Overrides por tenant
  // ============================================================

  async createTenantOverride(organizationId: string, dto: CreateFeatureFlagDto) {
    const key = FeatureFlagKey.of(dto.key).toString();
    const existing = await this.repo.findTenantOverride(organizationId, key);
    if (existing) {
      throw new FeatureFlagDuplicadaError(key, organizationId);
    }
    const flag = await this.repo.create({
      key,
      name: dto.name,
      ...(dto.description !== undefined ? { description: dto.description } : {}),
      enabled: dto.enabled ?? false,
      metadata: (dto.metadata as Prisma.InputJsonValue) ?? Prisma.JsonNull,
      organizationId,
    });
    await this.reader.invalidate(organizationId, key);
    return flag;
  }

  async listForTenant(organizationId: string) {
    const [globalFlags, tenantFlags] = await Promise.all([
      this.repo.listGlobal(),
      this.repo.listTenantOverrides(organizationId),
    ]);
    const tenantKeys = new Set(tenantFlags.map((f) => f.key));
    return {
      global: globalFlags.filter((f) => !tenantKeys.has(f.key)),
      overrides: tenantFlags,
    };
  }

  async updateTenantOverride(organizationId: string, rawKey: string, dto: UpdateFeatureFlagDto) {
    const key = FeatureFlagKey.of(rawKey).toString();
    const flag = await this.repo.findTenantOverride(organizationId, key);
    if (!flag) {
      throw new FeatureFlagNoEncontradaError(key, organizationId);
    }
    const updated = await this.repo.update(flag.id, {
      ...(dto.name !== undefined ? { name: dto.name } : {}),
      ...(dto.description !== undefined ? { description: dto.description } : {}),
      ...(dto.enabled !== undefined ? { enabled: dto.enabled } : {}),
      ...(dto.metadata !== undefined ? { metadata: dto.metadata as Prisma.InputJsonValue } : {}),
    });
    await this.reader.invalidate(organizationId, key);
    return updated;
  }

  async deleteTenantOverride(organizationId: string, rawKey: string): Promise<void> {
    const key = FeatureFlagKey.of(rawKey).toString();
    const flag = await this.repo.findTenantOverride(organizationId, key);
    if (!flag) {
      throw new FeatureFlagNoEncontradaError(key, organizationId);
    }
    await this.repo.delete(flag.id);
    await this.reader.invalidate(organizationId, key);
  }

  async toggleTenantOverride(organizationId: string, rawKey: string): Promise<boolean> {
    const key = FeatureFlagKey.of(rawKey).toString();
    const flag = await this.repo.findTenantOverride(organizationId, key);
    if (!flag) {
      throw new FeatureFlagNoEncontradaError(key, organizationId);
    }
    const updated = await this.repo.update(flag.id, { enabled: !flag.enabled });
    await this.reader.invalidate(organizationId, key);
    return updated.enabled;
  }
}
