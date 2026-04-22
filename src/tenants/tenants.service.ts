import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { SystemRole } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { UpdateTenantDto } from './dto/update-tenant.dto';

@Injectable()
export class TenantsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateTenantDto, ownerId: string) {
    const slug = this.generateSlug(dto.name);
    const existing = await this.prisma.organization.findUnique({ where: { slug } });
    if (existing) {
      throw new BadRequestException('Tenant slug already exists');
    }

    return this.prisma.organization.create({
      data: {
        name: dto.name,
        slug,
        memberships: {
          create: { userId: ownerId, systemRole: SystemRole.OWNER },
        },
      },
      include: { memberships: true },
    });
  }

  async findById(id: string) {
    const tenant = await this.prisma.organization.findUnique({ where: { id } });
    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }
    return tenant;
  }

  async findBySlug(slug: string) {
    const tenant = await this.prisma.organization.findUnique({ where: { slug } });
    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }
    return tenant;
  }

  async update(id: string, dto: UpdateTenantDto) {
    return this.prisma.organization.update({
      where: { id },
      data: dto,
    });
  }

  async getMembers(tenantId: string) {
    return this.prisma.membership.findMany({
      where: { organizationId: tenantId },
      include: {
        user: {
          select: { id: true, email: true, displayName: true },
        },
        customRole: { select: { id: true, slug: true, name: true } },
      },
    });
  }

  private generateSlug(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }
}
