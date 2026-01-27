import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { TenantContextService } from '../common/tenant-context/tenant-context.service';
import { InviteUserDto } from './dto/invite-user.dto';
import { UpdateMembershipDto } from './dto/update-membership.dto';

const Role = {
  OWNER: 'OWNER',
  ADMIN: 'ADMIN',
  MEMBER: 'MEMBER',
} as const;

@Injectable()
export class MembershipsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
  ) {}

  async invite(dto: InviteUserDto) {
    const tenantId = this.tenantContext.getTenantId();
    if (!tenantId) {
      throw new ForbiddenException('Tenant context required');
    }

    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase().trim() },
    });
    if (!user) {
      throw new NotFoundException('User not found. They must register first.');
    }

    const existing = await this.prisma.membership.findUnique({
      where: { tenantId_userId: { tenantId, userId: user.id } },
    });
    if (existing) {
      throw new BadRequestException('User is already a member');
    }

    return this.prisma.membership.create({
      data: {
        tenantId,
        userId: user.id,
        role: dto.role ?? Role.MEMBER,
      },
      include: {
        user: { select: { id: true, email: true, displayName: true } },
      },
    });
  }

  async updateRole(membershipId: string, dto: UpdateMembershipDto, actorUserId: string) {
    const tenantId = this.tenantContext.getTenantId();
    if (!tenantId) {
      throw new ForbiddenException('Tenant context required');
    }

    const membership = await this.prisma.membership.findUnique({
      where: { id: membershipId },
    });
    if (!membership || membership.tenantId !== tenantId) {
      throw new NotFoundException('Membership not found');
    }

    // Prevent self-demotion from owner
    if (membership.userId === actorUserId && membership.role === Role.OWNER) {
      throw new ForbiddenException('Cannot change your own owner role');
    }

    return this.prisma.membership.update({
      where: { id: membershipId },
      data: { role: dto.role },
    });
  }

  async remove(membershipId: string, _actorUserId: string) {
    const tenantId = this.tenantContext.getTenantId();
    if (!tenantId) {
      throw new ForbiddenException('Tenant context required');
    }

    const membership = await this.prisma.membership.findUnique({
      where: { id: membershipId },
    });
    if (!membership || membership.tenantId !== tenantId) {
      throw new NotFoundException('Membership not found');
    }

    // Prevent removing yourself if you're the only owner
    if (membership.role === Role.OWNER) {
      const ownerCount = await this.prisma.membership.count({
        where: { tenantId, role: Role.OWNER },
      });
      if (ownerCount <= 1) {
        throw new ForbiddenException('Cannot remove the last owner');
      }
    }

    return this.prisma.membership.delete({ where: { id: membershipId } });
  }

  async leave(tenantId: string, userId: string) {
    const membership = await this.prisma.membership.findUnique({
      where: { tenantId_userId: { tenantId, userId } },
    });
    if (!membership) {
      throw new NotFoundException('Membership not found');
    }

    if (membership.role === Role.OWNER) {
      const ownerCount = await this.prisma.membership.count({
        where: { tenantId, role: Role.OWNER },
      });
      if (ownerCount <= 1) {
        throw new ForbiddenException('Cannot leave as the last owner. Transfer ownership first.');
      }
    }

    return this.prisma.membership.delete({
      where: { tenantId_userId: { tenantId, userId } },
    });
  }
}
