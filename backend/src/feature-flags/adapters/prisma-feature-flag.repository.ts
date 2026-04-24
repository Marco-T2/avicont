import { Injectable } from '@nestjs/common';
import type { FeatureFlag } from '@prisma/client';

import { PrismaService } from '@/common/prisma.service';

import {
  ActualizarFeatureFlagData,
  CrearFeatureFlagData,
  FeatureFlagRepositoryPort,
} from '../ports/feature-flag.repository.port';

@Injectable()
export class PrismaFeatureFlagRepository extends FeatureFlagRepositoryPort {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async findGlobal(key: string): Promise<FeatureFlag | null> {
    return this.prisma.featureFlag.findFirst({
      where: { key, organizationId: null },
    });
  }

  async findTenantOverride(organizationId: string, key: string): Promise<FeatureFlag | null> {
    return this.prisma.featureFlag.findUnique({
      where: { key_organizationId: { key, organizationId } },
    });
  }

  async listGlobal(): Promise<FeatureFlag[]> {
    return this.prisma.featureFlag.findMany({
      where: { organizationId: null },
      orderBy: { key: 'asc' },
    });
  }

  async listTenantOverrides(organizationId: string): Promise<FeatureFlag[]> {
    return this.prisma.featureFlag.findMany({
      where: { organizationId },
      orderBy: { key: 'asc' },
    });
  }

  async create(data: CrearFeatureFlagData): Promise<FeatureFlag> {
    return this.prisma.featureFlag.create({
      data: {
        key: data.key,
        name: data.name,
        ...(data.description !== undefined ? { description: data.description } : {}),
        enabled: data.enabled,
        metadata: data.metadata,
        organizationId: data.organizationId,
      },
    });
  }

  async update(id: string, data: ActualizarFeatureFlagData): Promise<FeatureFlag> {
    return this.prisma.featureFlag.update({
      where: { id },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.description !== undefined ? { description: data.description } : {}),
        ...(data.enabled !== undefined ? { enabled: data.enabled } : {}),
        ...(data.metadata !== undefined ? { metadata: data.metadata } : {}),
      },
    });
  }

  async delete(id: string): Promise<void> {
    await this.prisma.featureFlag.delete({ where: { id } });
  }
}
