import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { TenantContextService } from '../common/tenant-context/tenant-context.service';

export interface AuditLogEntry {
  action: string;
  entity: string;
  entityId: string;
  tenantId?: string;
  userId?: string;
  metadata?: Record<string, any>;
}

@Injectable()
export class AuditService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
  ) {}

  async log(entry: AuditLogEntry) {
    const tenantId = entry.tenantId ?? this.tenantContext.getTenantId();
    const userId = entry.userId ?? this.tenantContext.getUserId();

    if (!tenantId) {
      // Skip audit if no tenant context (e.g., public routes)
      return;
    }

    // Use $executeRaw to bypass middleware and avoid circular tenant injection
    await this.prisma.auditLog.create({
      data: {
        action: entry.action,
        entity: entry.entity,
        entityId: entry.entityId,
        tenantId,
        userId,
        metadata: entry.metadata ?? {},
      },
    });
  }

  async findByTenant(tenantId: string, options?: { skip?: number; take?: number }) {
    return this.prisma.auditLog.findMany({
      where: { tenantId },
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
      where: { tenantId, entity, entityId },
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { id: true, email: true, displayName: true } },
      },
    });
  }
}
