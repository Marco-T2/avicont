import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import type { FechaContable } from '@/common/domain/fecha-contable';
import { PrismaService } from '@/common/prisma.service';

import { PeriodoLite, PeriodosReaderPort } from '../ports/periodos-reader.port';

@Injectable()
export class PrismaPeriodosReaderAdapter extends PeriodosReaderPort {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async obtenerPorFecha(
    tenantId: string,
    fecha: FechaContable,
    tx?: Prisma.TransactionClient,
  ): Promise<PeriodoLite | null> {
    const client = tx ?? this.prisma;
    const row = await client.periodoFiscal.findUnique({
      where: {
        organizationId_year_month: {
          organizationId: tenantId,
          year: fecha.year,
          month: fecha.month,
        },
      },
      select: { id: true, status: true },
    });
    return row ?? null;
  }
}
