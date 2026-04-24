import { Injectable } from '@nestjs/common';
import type { Membership, Prisma } from '@prisma/client';

import { PrismaService } from '@/common/prisma.service';

import {
  MembershipConUserYRol,
  MembershipCreateData,
  MembershipRepositoryPort,
  MembershipUpdateRolData,
} from '../ports/membership.repository.port';

@Injectable()
export class PrismaMembershipRepository extends MembershipRepositoryPort {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async create(
    tenantId: string,
    data: MembershipCreateData,
    tx?: Prisma.TransactionClient,
  ): Promise<MembershipConUserYRol> {
    const client = tx ?? this.prisma;
    return client.membership.create({
      data: {
        organizationId: tenantId,
        userId: data.userId,
        systemRole: data.systemRole,
        customRoleId: data.customRoleId,
      },
      include: {
        user: { select: { id: true, email: true, displayName: true } },
        customRole: { select: { id: true, slug: true, name: true } },
      },
    });
  }

  async updateRol(
    tenantId: string,
    membershipId: string,
    data: MembershipUpdateRolData,
    tx?: Prisma.TransactionClient,
  ): Promise<Membership> {
    const client = tx ?? this.prisma;
    return client.membership.update({
      where: { id: membershipId, organizationId: tenantId },
      data: {
        systemRole: data.systemRole,
        customRoleId: data.customRoleId,
      },
    });
  }

  async deleteById(
    tenantId: string,
    membershipId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<Membership> {
    const client = tx ?? this.prisma;
    return client.membership.delete({
      where: { id: membershipId, organizationId: tenantId },
    });
  }

  async deleteByUserAndTenant(
    tenantId: string,
    userId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<Membership> {
    const client = tx ?? this.prisma;
    return client.membership.delete({
      where: { organizationId_userId: { organizationId: tenantId, userId } },
    });
  }

  async findById(
    tenantId: string,
    membershipId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<Membership | null> {
    const client = tx ?? this.prisma;
    return client.membership.findFirst({
      where: { id: membershipId, organizationId: tenantId },
    });
  }

  async findByUserAndTenant(
    tenantId: string,
    userId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<Membership | null> {
    const client = tx ?? this.prisma;
    return client.membership.findUnique({
      where: { organizationId_userId: { organizationId: tenantId, userId } },
    });
  }

  async countOwners(
    tenantId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<number> {
    const client = tx ?? this.prisma;
    return client.membership.count({
      where: { organizationId: tenantId, systemRole: 'OWNER' },
    });
  }
}
