import { Injectable } from '@nestjs/common';

import { PrismaService } from '@/common/prisma.service';

import type {
  MembershipActivaConOrganizacion,
  MembershipActivaDeTenantParaAuth,
  MembershipActivaParaAuth,
  MembershipDeTenantParaAdmin,
  MembershipParaImpersonation,
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

  async findActivasConOrganizacionByUserId(
    userId: string,
  ): Promise<MembershipActivaConOrganizacion[]> {
    const rows = await this.prisma.membership.findMany({
      where: { userId, deactivatedAt: null },
      select: {
        systemRole: true,
        customRole: { select: { slug: true } },
        organization: { select: { id: true, name: true, slug: true } },
      },
    });
    return rows.map((r) => ({
      organizationId: r.organization.id,
      organizationName: r.organization.name,
      organizationSlug: r.organization.slug,
      systemRole: r.systemRole,
      customRoleSlug: r.customRole?.slug ?? null,
    }));
  }

  async findForImpersonation(
    userId: string,
    tenantId: string,
  ): Promise<MembershipParaImpersonation | null> {
    const row = await this.prisma.membership.findUnique({
      where: { organizationId_userId: { organizationId: tenantId, userId } },
      select: {
        systemRole: true,
        deactivatedAt: true,
        customRole: { select: { slug: true } },
        user: { select: { email: true, isActive: true } },
      },
    });
    if (!row) return null;
    return {
      systemRole: row.systemRole,
      deactivatedAt: row.deactivatedAt,
      customRoleSlug: row.customRole?.slug ?? null,
      userEmail: row.user.email,
      userIsActive: row.user.isActive,
    };
  }

  async findAllByTenant(tenantId: string): Promise<MembershipDeTenantParaAdmin[]> {
    const rows = await this.prisma.membership.findMany({
      where: { organizationId: tenantId },
      select: {
        id: true,
        userId: true,
        systemRole: true,
        customRoleId: true,
        deactivatedAt: true,
        createdAt: true,
        user: { select: { id: true, email: true, displayName: true } },
        customRole: { select: { id: true, slug: true, name: true } },
      },
    });
    return rows.map((r) => ({
      id: r.id,
      userId: r.userId,
      systemRole: r.systemRole,
      customRoleId: r.customRoleId,
      deactivatedAt: r.deactivatedAt,
      createdAt: r.createdAt,
      user: r.user,
      customRole: r.customRole,
    }));
  }
}
