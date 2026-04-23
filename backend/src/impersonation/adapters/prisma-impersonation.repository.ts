import { Injectable } from '@nestjs/common';
import { ImpersonationLog, Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma.service';
import {
  CreateImpersonationLogData,
  ImpersonationRepositoryPort,
  LogActionData,
} from '../ports/impersonation.repository.port';

@Injectable()
export class PrismaImpersonationRepository implements ImpersonationRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  createLog(data: CreateImpersonationLogData): Promise<ImpersonationLog> {
    return this.prisma.impersonationLog.create({
      data: {
        adminUserId: data.adminUserId,
        targetUserId: data.targetUserId,
        organizationId: data.organizationId,
        reason: data.reason,
      },
    });
  }

  findActiveByAdmin(adminUserId: string): Promise<ImpersonationLog | null> {
    return this.prisma.impersonationLog.findFirst({
      where: { adminUserId, endedAt: null },
      orderBy: { startedAt: 'desc' },
    });
  }

  findActiveById(id: string): Promise<ImpersonationLog | null> {
    return this.prisma.impersonationLog.findFirst({
      where: { id, endedAt: null },
    });
  }

  endLog(id: string): Promise<ImpersonationLog> {
    return this.prisma.impersonationLog.update({
      where: { id },
      data: { endedAt: new Date() },
    });
  }

  async logAction(data: LogActionData): Promise<void> {
    await this.prisma.impersonationAction.create({
      data: {
        impersonationLogId: data.impersonationLogId,
        action: data.action,
        resource: data.resource ?? null,
        metadata: (data.metadata as Prisma.InputJsonValue) ?? Prisma.JsonNull,
      },
    });
  }
}
