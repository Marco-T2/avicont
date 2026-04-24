import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import { PrismaService } from '@/common/prisma.service';

import { ContactoParaLinea, ContactosReaderPort } from '../ports/contactos-reader.port';

@Injectable()
export class PrismaContactosReaderAdapter extends ContactosReaderPort {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async obtenerBatch(
    tenantId: string,
    contactoIds: string[],
    tx?: Prisma.TransactionClient,
  ): Promise<Map<string, ContactoParaLinea>> {
    if (contactoIds.length === 0) return new Map();

    const uniqueIds = Array.from(new Set(contactoIds));

    const client = tx ?? this.prisma;
    const rows = await client.contacto.findMany({
      where: { id: { in: uniqueIds }, organizationId: tenantId },
      select: { id: true, activo: true },
    });

    return new Map(rows.map((r) => [r.id, r]));
  }
}
