import { Injectable } from '@nestjs/common';

import { PrismaService } from '@/common/prisma.service';
import { ActivityCursor } from '@/platform/lib/activity-cursor';
import {
  FindRecentOptions,
  PlatformActivityItem,
  PlatformActivityPage,
  PlatformActivityReaderPort,
} from '../ports/platform-activity-reader.port';

/**
 * Adapter Prisma para PlatformActivityReaderPort.
 *
 * ⚠️ EXCEPCIÓN ANTI-31 DELIBERADA: lee de `platform_audit` sin filtrar por
 * tenantId. El enforcement está en SuperAdminGuard (CLAUDE.md §10.1).
 *
 * Resolución de actor y targetOrganization por `include` en la misma query
 * (sin N+1 — REQ-PCT-04).
 *
 * El campo `payload` NO se selecciona: dato sensible, nunca expuesto en el
 * timeline público del super-admin (REQ-PCT-04).
 */
@Injectable()
export class PrismaPlatformActivityReaderAdapter extends PlatformActivityReaderPort {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  override async findRecent(options: FindRecentOptions): Promise<PlatformActivityPage> {
    const { limit, cursor, orgId } = options;

    // Predicado cursor: OR [(createdAt < cursor.createdAt) | (createdAt == cursor.createdAt AND id < cursor.id)]
    // Orden: createdAt DESC, id DESC → estable ante inserts concurrentes (REQ-PCT-05).
    const cursorWhere =
      cursor !== undefined
        ? {
            OR: [
              { createdAt: { lt: cursor.createdAt } },
              { createdAt: cursor.createdAt, id: { lt: cursor.id } },
            ],
          }
        : {};

    const orgFilter = orgId !== undefined ? { targetOrganizationId: orgId } : {};

    const rows = await this.prisma.platformAudit.findMany({
      where: { ...orgFilter, ...cursorWhere },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      select: {
        id: true,
        action: true,
        actorUserId: true,
        targetOrganizationId: true,
        createdAt: true,
        // payload está AUSENTE (REQ-PCT-04 — dato sensible, nunca expuesto)
        actor: {
          select: { email: true, displayName: true },
        },
        targetOrganization: {
          select: { name: true },
        },
      },
    });

    const hasNext = rows.length > limit;
    const pageRows = hasNext ? rows.slice(0, limit) : rows;

    const items: PlatformActivityItem[] = pageRows.map((row) => ({
      id: row.id,
      action: row.action,
      actorUserId: row.actorUserId,
      actor: {
        email: row.actor.email,
        displayName: row.actor.displayName,
      },
      targetOrganizationId: row.targetOrganizationId,
      targetOrganization:
        row.targetOrganization !== null ? { name: row.targetOrganization.name } : null,
      createdAt: row.createdAt,
    }));

    let nextCursor: string | null = null;
    if (hasNext) {
      const lastItem = pageRows[pageRows.length - 1];
      if (lastItem !== undefined) {
        nextCursor = ActivityCursor.encode(lastItem.createdAt, lastItem.id);
      }
    }

    return { items, nextCursor };
  }
}
