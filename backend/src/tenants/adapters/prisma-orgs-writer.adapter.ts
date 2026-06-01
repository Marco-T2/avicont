import { Injectable } from '@nestjs/common';
import { type Organization, type OrganizationStatus, SystemRole, type Prisma, type Plan } from '@prisma/client';

import { PrismaService } from '@/common/prisma.service';
import { OrganizationConMemberships } from '@/tenants/ports/tenant.repository.port';
import { OrgCreateData, OrgEntitlementData, OrgsWriterPort } from '@/platform/ports/orgs-writer.port';

/**
 * Adapter que implementa OrgsWriterPort para el módulo platform.
 * El módulo `tenants` es el dueño del dominio Organization; expone esta
 * superficie de escritura a través del token ORGS_WRITER_PORT (CLAUDE.md §3.3).
 *
 * Nota: este adapter crea la org + membership OWNER en un nested write de
 * Prisma, igual que PrismaTenantRepository.create, pero sin la lógica de
 * slug + seeding que maneja PlatformAdminService al orquestar la TX completa.
 */
@Injectable()
export class PrismaOrgsWriterAdapter extends OrgsWriterPort {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  override async create(
    data: OrgCreateData,
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

  override async updateStatus(id: string, status: OrganizationStatus): Promise<Organization | null> {
    try {
      return await this.prisma.organization.update({
        where: { id },
        data: { status },
      });
    } catch (e) {
      // P2025: registro no encontrado
      if (isPrismaNotFound(e)) return null;
      throw e;
    }
  }

  override async updateEntitlement(id: string, data: OrgEntitlementData): Promise<Organization | null> {
    try {
      return await this.prisma.organization.update({
        where: { id },
        data: {
          ...(data.plan !== undefined ? { plan: data.plan as Plan } : {}),
          ...(data.contabilidadEnabled !== undefined ? { contabilidadEnabled: data.contabilidadEnabled } : {}),
          ...(data.granjaEnabled !== undefined ? { granjaEnabled: data.granjaEnabled } : {}),
        },
      });
    } catch (e) {
      if (isPrismaNotFound(e)) return null;
      throw e;
    }
  }
}

function isPrismaNotFound(e: unknown): boolean {
  return (
    typeof e === 'object' &&
    e !== null &&
    'code' in e &&
    (e as { code: unknown }).code === 'P2025'
  );
}
