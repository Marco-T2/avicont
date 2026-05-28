import { Injectable } from '@nestjs/common';
import { Prisma, SystemRole } from '@prisma/client';
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

import { toPrismaTipoEmpresa } from './enum-mappers';

@Injectable()
export class PrismaTenantRepository extends TenantRepositoryPort {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  override async create(
    data: TenantCreateData,
    tx?: Prisma.TransactionClient,
  ): Promise<OrganizationConMemberships> {
    const client = tx ?? this.prisma;
    return client.organization.create({
      data: {
        name: data.name,
        slug: data.slug,
        contabilidadEnabled: data.contabilidadEnabled,
        granjaEnabled: data.granjaEnabled,
        memberships: {
          create: { userId: data.ownerUserId, systemRole: SystemRole.OWNER },
        },
      },
      include: { memberships: true },
    });
  }

  override findById(id: string): Promise<Organization | null> {
    return this.prisma.organization.findUnique({ where: { id } });
  }

  override findBySlug(slug: string): Promise<Organization | null> {
    return this.prisma.organization.findUnique({ where: { slug } });
  }

  override async existsBySlug(slug: string): Promise<boolean> {
    const found = await this.prisma.organization.findUnique({
      where: { slug },
      select: { id: true },
    });
    return found !== null;
  }

  override update(id: string, data: TenantUpdateData): Promise<Organization> {
    return this.prisma.organization.update({
      where: { id },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.plan !== undefined ? { plan: data.plan } : {}),
        ...(data.status !== undefined ? { status: data.status } : {}),
        ...(data.tipoEmpresaPrincipal !== undefined
          ? { tipoEmpresaPrincipal: toPrismaTipoEmpresa(data.tipoEmpresaPrincipal) }
          : {}),
      },
    });
  }

  override findFeatures(id: string): Promise<TenantFeatures | null> {
    return this.prisma.organization.findUnique({
      where: { id },
      select: { contabilidadEnabled: true, granjaEnabled: true },
    });
  }

  override updateFeatures(id: string, data: TenantFeaturesUpdate): Promise<TenantFeatures> {
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
