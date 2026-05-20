import { Injectable } from '@nestjs/common';
import { SystemRole } from '@prisma/client';
import type { Organization } from '@prisma/client';

import { PrismaService } from '@/common/prisma.service';

import {
  OrganizationConMemberships,
  TenantCreateData,
  TenantFeatures,
  TenantFeaturesUpdate,
  TenantRepositoryPort,
  TenantUpdateData,
} from '../ports/tenant.repository.port';

@Injectable()
export class PrismaTenantRepository extends TenantRepositoryPort {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async create(data: TenantCreateData): Promise<OrganizationConMemberships> {
    return this.prisma.organization.create({
      data: {
        name: data.name,
        slug: data.slug,
        memberships: {
          create: { userId: data.ownerUserId, systemRole: SystemRole.OWNER },
        },
      },
      include: { memberships: true },
    });
  }

  findById(id: string): Promise<Organization | null> {
    return this.prisma.organization.findUnique({ where: { id } });
  }

  findBySlug(slug: string): Promise<Organization | null> {
    return this.prisma.organization.findUnique({ where: { slug } });
  }

  async existsBySlug(slug: string): Promise<boolean> {
    const found = await this.prisma.organization.findUnique({
      where: { slug },
      select: { id: true },
    });
    return found !== null;
  }

  update(id: string, data: TenantUpdateData): Promise<Organization> {
    return this.prisma.organization.update({
      where: { id },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.plan !== undefined ? { plan: data.plan } : {}),
        ...(data.status !== undefined ? { status: data.status } : {}),
        ...(data.tipoEmpresaPrincipal !== undefined
          ? { tipoEmpresaPrincipal: data.tipoEmpresaPrincipal }
          : {}),
      },
    });
  }

  findFeatures(id: string): Promise<TenantFeatures | null> {
    return this.prisma.organization.findUnique({
      where: { id },
      select: { contabilidadEnabled: true, granjaEnabled: true },
    });
  }

  updateFeatures(id: string, data: TenantFeaturesUpdate): Promise<TenantFeatures> {
    return this.prisma.organization.update({
      where: { id },
      data: {
        ...(data.contabilidadEnabled !== undefined
          ? { contabilidadEnabled: data.contabilidadEnabled }
          : {}),
        ...(data.granjaEnabled !== undefined ? { granjaEnabled: data.granjaEnabled } : {}),
      },
      select: { contabilidadEnabled: true, granjaEnabled: true },
    });
  }
}
