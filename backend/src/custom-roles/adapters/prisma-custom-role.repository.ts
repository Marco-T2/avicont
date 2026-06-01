import { Injectable } from '@nestjs/common';
import { CustomRole } from '@prisma/client';
import { PrismaService } from '../../common/prisma.service';
import {
  CreateCustomRoleData,
  CustomRoleRepositoryPort,
  UpdateCustomRoleData,
} from '../ports/custom-role.repository.port';

@Injectable()
export class PrismaCustomRoleRepository implements CustomRoleRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  list(organizationId: string): Promise<CustomRole[]> {
    return this.prisma.customRole.findMany({
      where: { organizationId },
      orderBy: [{ isSystemDefault: 'desc' }, { name: 'asc' }],
    });
  }

  findById(id: string, organizationId: string): Promise<CustomRole | null> {
    return this.prisma.customRole.findFirst({ where: { id, organizationId } });
  }

  findBySlug(organizationId: string, slug: string): Promise<CustomRole | null> {
    return this.prisma.customRole.findUnique({
      where: { organizationId_slug: { organizationId, slug } },
    });
  }

  create(data: CreateCustomRoleData): Promise<CustomRole> {
    return this.prisma.customRole.create({
      data: {
        organizationId: data.organizationId,
        slug: data.slug,
        name: data.name,
        description: data.description ?? null,
        permissions: data.permissions,
        createdById: data.createdById ?? null,
        isSystemDefault: data.isSystemDefault ?? false,
        isEditable: data.isEditable ?? true,
      },
    });
  }

  update(id: string, organizationId: string, data: UpdateCustomRoleData): Promise<CustomRole> {
    return this.prisma.customRole.update({
      where: { id, organizationId },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.description !== undefined ? { description: data.description } : {}),
        ...(data.permissions !== undefined ? { permissions: data.permissions } : {}),
      },
    });
  }

  async delete(id: string, organizationId: string): Promise<void> {
    await this.prisma.customRole.delete({ where: { id, organizationId } });
  }

  countActiveMembers(customRoleId: string, organizationId: string): Promise<number> {
    return this.prisma.membership.count({
      where: { customRoleId, organizationId, deactivatedAt: null },
    });
  }

  async listAffectedUserIds(customRoleId: string, organizationId: string): Promise<string[]> {
    const ms = await this.prisma.membership.findMany({
      where: { customRoleId, organizationId },
      select: { userId: true },
    });
    return ms.map((m) => m.userId);
  }

  async listMembersWithUsers(customRoleId: string, organizationId: string) {
    const ms = await this.prisma.membership.findMany({
      where: { customRoleId, organizationId },
      select: {
        id: true,
        deactivatedAt: true,
        user: { select: { id: true, email: true, displayName: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
    return ms.map((m) => ({
      membershipId: m.id,
      deactivatedAt: m.deactivatedAt,
      user: m.user,
    }));
  }
}
