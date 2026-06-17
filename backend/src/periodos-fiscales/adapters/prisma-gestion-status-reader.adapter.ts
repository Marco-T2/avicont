import { Injectable } from '@nestjs/common';
import { GestionFiscalStatus } from '@prisma/client';

import { PrismaService } from '@/common/prisma.service';

import { GestionStatusReaderPort } from '../ports/gestion-status-reader.port';

@Injectable()
export class PrismaGestionStatusReaderAdapter extends GestionStatusReaderPort {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async estaGestionCerradaPorPeriodo(periodoFiscalId: string, tenantId: string): Promise<boolean> {
    // Defense in depth (§4.2): organizationId primer predicado — un período de
    // otro tenant devuelve null y se trata como "no cerrada".
    const row = await this.prisma.periodoFiscal.findFirst({
      where: { id: periodoFiscalId, organizationId: tenantId },
      select: { gestion: { select: { status: true } } },
    });

    if (!row) return false;
    return row.gestion.status === GestionFiscalStatus.CERRADA;
  }
}
