import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import type { FechaContable } from '@/common/domain/fecha-contable';
import { PrismaService } from '@/common/prisma.service';

import { PeriodoLite, PeriodosReaderPort, ReaperturaActiva } from '../ports/periodos-reader.port';

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

  async obtenerReaperturaActiva(
    tenantId: string,
    periodoId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<ReaperturaActiva | null> {
    const client = tx ?? this.prisma;
    // Defense in depth (CLAUDE.md §4.2): filtrar por organizationId del
    // período padre para evitar devolver reaperturas de otro tenant aunque
    // el periodoId sea correcto. Una query sin filtro de tenant es bug de
    // seguridad.
    const row = await client.periodoFiscalReopening.findFirst({
      where: {
        periodoId,
        reclosedAt: null,
        periodo: { organizationId: tenantId },
      },
      select: { id: true, reopenedAt: true },
      orderBy: { reopenedAt: 'desc' },
    });
    return row ?? null;
  }
}
