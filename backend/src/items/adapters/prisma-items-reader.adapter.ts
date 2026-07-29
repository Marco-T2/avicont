import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import { PrismaService } from '@/common/prisma.service';

import { ItemParaLinea, ItemsReaderPort } from '../ports/items-reader.port';

@Injectable()
export class PrismaItemsReaderAdapter extends ItemsReaderPort {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async obtenerBatch(
    tenantId: string,
    itemIds: string[],
    tx?: Prisma.TransactionClient,
  ): Promise<Map<string, ItemParaLinea>> {
    if (itemIds.length === 0) return new Map();

    const uniqueIds = Array.from(new Set(itemIds));

    const client = tx ?? this.prisma;
    const rows = await client.item.findMany({
      where: { id: { in: uniqueIds }, organizationId: tenantId },
      select: { id: true, activo: true },
    });

    return new Map(rows.map((r) => [r.id, r]));
  }
}
