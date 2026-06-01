import { Injectable } from '@nestjs/common';
import { SystemRole, type Prisma } from '@prisma/client';

import { PrismaService } from '@/common/prisma.service';
import { MembershipsWriterPort } from '@/platform/ports/memberships-writer.port';

/**
 * Adapter que implementa MembershipsWriterPort para el módulo platform.
 * El módulo `memberships` es el dueño del dominio Membership; expone esta
 * superficie de escritura cross-módulo a través del token MEMBERSHIPS_WRITER_PORT
 * (CLAUDE.md §3.3 y §3.7).
 *
 * Usado por PlatformAdminService al crear una org con OWNER designado por email
 * (REQ-SA-13). La membership OWNER se crea en la misma transacción que la org
 * para garantizar atomicidad.
 */
@Injectable()
export class PrismaMembershipsWriterAdapter extends MembershipsWriterPort {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  override async createOwnerMembership(
    userId: string,
    organizationId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const client = tx ?? this.prisma;
    await client.membership.create({
      data: {
        userId,
        organizationId,
        systemRole: SystemRole.OWNER,
      },
    });
  }
}
