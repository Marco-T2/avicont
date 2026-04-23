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

  findById(id: string): Promise<CustomRole | null> {
    return this.prisma.customRole.findUnique({ where: { id } });
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

  update(id: string, data: UpdateCustomRoleData): Promise<CustomRole> {
    return this.prisma.customRole.update({
      where: { id },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.description !== undefined ? { description: data.description } : {}),
        ...(data.permissions !== undefined ? { permissions: data.permissions } : {}),
      },
    });
  }

  async delete(id: string): Promise<void> {
    await this.prisma.customRole.delete({ where: { id } });
  }

  countActiveMembers(customRoleId: string): Promise<number> {
    return this.prisma.membership.count({
      where: { customRoleId, deactivatedAt: null },
    });
  }

  async listAffectedUserIds(customRoleId: string): Promise<string[]> {
    const ms = await this.prisma.membership.findMany({
      where: { customRoleId },
      select: { userId: true },
    });
    return ms.map((m) => m.userId);
  }

  async listMembersWithUsers(customRoleId: string) {
    const ms = await this.prisma.membership.findMany({
      where: { customRoleId },
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
