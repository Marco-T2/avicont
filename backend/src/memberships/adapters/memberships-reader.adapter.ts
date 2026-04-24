import { Injectable } from '@nestjs/common';

import { PrismaService } from '@/common/prisma.service';

import type {
  MembershipActivaDeTenantParaAuth,
  MembershipActivaParaAuth,
  MembershipsReaderPort,
} from '../ports/memberships-reader.port';

@Injectable()
export class MembershipsReaderAdapter implements MembershipsReaderPort {
  constructor(private readonly prisma: PrismaService) {}

  async findActivasByUserId(userId: string): Promise<MembershipActivaParaAuth[]> {
    const rows = await this.prisma.membership.findMany({
      where: { userId, deactivatedAt: null },
      select: {
        organizationId: true,
        systemRole: true,
        customRole: { select: { slug: true } },
      },
    });
    return rows.map((r) => ({
      organizationId: r.organizationId,
      systemRole: r.systemRole,
      customRoleSlug: r.customRole?.slug ?? null,
    }));
  }

  async findActivaByUserAndTenant(
    userId: string,
    tenantId: string,
  ): Promise<MembershipActivaDeTenantParaAuth | null> {
    const row = await this.prisma.membership.findUnique({
      where: { organizationId_userId: { organizationId: tenantId, userId } },
      select: {
        organizationId: true,
        systemRole: true,
        deactivatedAt: true,
        customRole: { select: { slug: true } },
        user: { select: { email: true } },
      },
    });
    if (!row || row.deactivatedAt !== null) return null;
    return {
      organizationId: row.organizationId,
      systemRole: row.systemRole,
      customRoleSlug: row.customRole?.slug ?? null,
      userEmail: row.user.email,
    };
  }
}
