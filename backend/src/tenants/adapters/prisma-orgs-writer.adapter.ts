import { Injectable } from '@nestjs/common';
import { SystemRole, type Prisma } from '@prisma/client';

import { PrismaService } from '@/common/prisma.service';
import { OrganizationConMemberships } from '@/tenants/ports/tenant.repository.port';
import { OrgCreateData, OrgsWriterPort } from '@/platform/ports/orgs-writer.port';

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
}
