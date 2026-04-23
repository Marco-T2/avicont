import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { SystemRole } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';
import { TenantContextService } from '../common/tenant-context/tenant-context.service';
import { InviteUserDto } from './dto/invite-user.dto';
import { UpdateMembershipDto } from './dto/update-membership.dto';

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

    this.assertExactlyOneRoleAssignment(dto.systemRole, dto.customRoleId);

    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase().trim() },
    });
    if (!user) {
      throw new NotFoundException('User not found. They must register first.');
    }

    const existing = await this.prisma.membership.findUnique({
      where: { organizationId_userId: { organizationId: tenantId, userId: user.id } },
    });
    if (existing) {
      throw new BadRequestException('User is already a member');
    }

    if (dto.customRoleId) {
      await this.assertCustomRoleBelongsToTenant(dto.customRoleId, tenantId);
    }

    return this.prisma.membership.create({
      data: {
        organizationId: tenantId,
        userId: user.id,
        systemRole: dto.systemRole ?? null,
        customRoleId: dto.customRoleId ?? null,
      },
      include: {
        user: { select: { id: true, email: true, displayName: true } },
        customRole: { select: { id: true, slug: true, name: true } },
      },
    });
  }

  async updateRole(membershipId: string, dto: UpdateMembershipDto, actorUserId: string) {
    const tenantId = this.tenantContext.getTenantId();
    if (!tenantId) {
      throw new ForbiddenException('Tenant context required');
    }

    this.assertExactlyOneRoleAssignment(dto.systemRole, dto.customRoleId);

    const membership = await this.prisma.membership.findUnique({
      where: { id: membershipId },
    });
    if (!membership || membership.organizationId !== tenantId) {
      throw new NotFoundException('Membership not found');
    }

    // No permitir auto-degradación desde OWNER: el último OWNER debe
    // transferir ownership antes de cambiar su rol.
    if (
      membership.userId === actorUserId &&
      membership.systemRole === SystemRole.OWNER &&
      dto.systemRole !== SystemRole.OWNER
    ) {
      throw new ForbiddenException('Cannot change your own owner role');
    }

    if (dto.customRoleId) {
      await this.assertCustomRoleBelongsToTenant(dto.customRoleId, tenantId);
    }

    return this.prisma.membership.update({
      where: { id: membershipId },
      data: {
        systemRole: dto.systemRole ?? null,
        customRoleId: dto.customRoleId ?? null,
      },
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
    if (!membership || membership.organizationId !== tenantId) {
      throw new NotFoundException('Membership not found');
    }

    if (membership.systemRole === SystemRole.OWNER) {
      await this.assertNotLastOwner(tenantId);
    }

    return this.prisma.membership.delete({ where: { id: membershipId } });
  }

  async leave(tenantId: string, userId: string) {
    const membership = await this.prisma.membership.findUnique({
      where: { organizationId_userId: { organizationId: tenantId, userId } },
    });
    if (!membership) {
      throw new NotFoundException('Membership not found');
    }

    if (membership.systemRole === SystemRole.OWNER) {
      await this.assertNotLastOwner(tenantId);
    }

    return this.prisma.membership.delete({
      where: { organizationId_userId: { organizationId: tenantId, userId } },
    });
  }

  // ---------- helpers privados ----------

  private assertExactlyOneRoleAssignment(
    systemRole?: SystemRole | null,
    customRoleId?: string | null,
  ) {
    const hasSystem = systemRole !== undefined && systemRole !== null;
    const hasCustom = !!customRoleId;
    if (hasSystem === hasCustom) {
      throw new BadRequestException(
        'Debe especificarse exactamente uno de systemRole o customRoleId',
      );
    }
  }

  private async assertCustomRoleBelongsToTenant(customRoleId: string, tenantId: string) {
    const role = await this.prisma.customRole.findUnique({ where: { id: customRoleId } });
    if (!role || role.organizationId !== tenantId) {
      throw new BadRequestException('customRoleId inválido para esta organización');
    }
  }

  private async assertNotLastOwner(tenantId: string) {
    const ownerCount = await this.prisma.membership.count({
      where: { organizationId: tenantId, systemRole: SystemRole.OWNER },
    });
    if (ownerCount <= 1) {
      throw new ForbiddenException(
        'No se puede eliminar al último OWNER. Transferir ownership primero.',
      );
    }
  }
}
