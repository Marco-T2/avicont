import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async findByTenant(tenantId: string, options?: { skip?: number; take?: number }) {
    return this.prisma.auditLog.findMany({
      where: { organizationId: tenantId },
      orderBy: { createdAt: 'desc' },
      skip: options?.skip ?? 0,
      take: options?.take ?? 50,
      include: {
        user: { select: { id: true, email: true, displayName: true } },
      },
    });
  }

  async findByEntity(tenantId: string, entity: string, entityId: string) {
    return this.prisma.auditLog.findMany({
      where: { organizationId: tenantId, entity, entityId },
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { id: true, email: true, displayName: true } },
      },
    });
  }
}
