import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import { PrismaService } from '@/common/prisma.service';

import {
  TipoDocumentoFisicoParaValidacion,
  TiposDocumentoFisicoReaderPort,
} from '../ports/tipos-documento-fisico-reader.port';

@Injectable()
export class PrismaTiposDocumentoFisicoReaderAdapter extends TiposDocumentoFisicoReaderPort {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async findById(
    tenantId: string,
    id: string,
    tx?: Prisma.TransactionClient,
  ): Promise<TipoDocumentoFisicoParaValidacion | null> {
    if (id.length === 0) return null;
    const client = tx ?? this.prisma;
    // select acota la superficie al shape mínimo del port (blast radius).
    return client.tipoDocumentoFisico.findFirst({
      where: { id, organizationId: tenantId },
      select: {
        id: true,
        codigo: true,
        esTributario: true,
        activo: true,
        tiposComprobanteAplicables: true,
        numeracionAutomatica: true,
        numeroInicial: true,
      },
    });
  }
}
