import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '@/common/prisma.service';
import { PlatformAuditEntry, PlatformAuditPort } from '../ports/platform-audit.port';

/**
 * Adapter Prisma para `PlatformAuditPort`.
 * Escribe en la tabla `platform_audit` (creada en Slice 1).
 */
@Injectable()
export class PrismaPlatformAuditRepository implements PlatformAuditPort {
  constructor(private readonly prisma: PrismaService) {}

  async record(entry: PlatformAuditEntry): Promise<void> {
    // Prisma exige InputJsonValue para campos Json (exactOptionalPropertyTypes).
    // Casteamos el payload a Prisma.InputJsonObject — es structuralmente idéntico.
    const payload: Prisma.InputJsonObject | undefined =
      entry.payload !== undefined ? (entry.payload as Prisma.InputJsonObject) : undefined;

    await this.prisma.platformAudit.create({
      data: {
        actorUserId: entry.actorUserId,
        action: entry.action,
        createdAt: entry.createdAt,
        ...(entry.targetOrganizationId !== undefined
          ? { targetOrganizationId: entry.targetOrganizationId }
          : {}),
        ...(payload !== undefined ? { payload } : {}),
      },
    });
  }
}
