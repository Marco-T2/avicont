import { Injectable } from '@nestjs/common';
import {
  PeriodoFiscal,
  PeriodoFiscalReopening,
  PeriodoFiscalStatus,
  Prisma,
} from '@prisma/client';

import { PrismaService } from '@/common/prisma.service';

import { PeriodoFiscalRepositoryPort } from '../ports/periodo-fiscal.repository.port';

@Injectable()
export class PrismaPeriodoFiscalRepository extends PeriodoFiscalRepositoryPort {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  findById(
    id: string,
    organizationId: string,
  ): Promise<PeriodoFiscal | null> {
    return this.prisma.periodoFiscal.findFirst({
      where: { id, organizationId },
    });
  }

  findByYearMonth(
    organizationId: string,
    year: number,
    month: number,
  ): Promise<PeriodoFiscal | null> {
    return this.prisma.periodoFiscal.findUnique({
      where: { organizationId_year_month: { organizationId, year, month } },
    });
  }

  listByGestion(
    gestionId: string,
    organizationId: string,
    filters: { status?: PeriodoFiscalStatus } = {},
  ): Promise<PeriodoFiscal[]> {
    return this.prisma.periodoFiscal.findMany({
      where: {
        gestionId,
        organizationId,
        ...(filters.status !== undefined ? { status: filters.status } : {}),
      },
      orderBy: { ordenEnGestion: 'asc' },
    });
  }

  cerrar(
    tx: Prisma.TransactionClient,
    id: string,
    userId: string,
  ): Promise<PeriodoFiscal> {
    return tx.periodoFiscal.update({
      where: { id },
      data: {
        status: 'CERRADO',
        closedAt: new Date(),
        closedByUserId: userId,
      },
    });
  }

  reabrir(
    tx: Prisma.TransactionClient,
    id: string,
  ): Promise<PeriodoFiscal> {
    return tx.periodoFiscal.update({
      where: { id },
      data: {
        status: 'ABIERTO',
        closedAt: null,
        closedByUserId: null,
      },
    });
  }

  marcarDefinitivo(
    tx: Prisma.TransactionClient,
    id: string,
  ): Promise<PeriodoFiscal> {
    return tx.periodoFiscal.update({
      where: { id },
      data: { esDefinitivo: true },
    });
  }

  crearReapertura(
    tx: Prisma.TransactionClient,
    data: { periodoId: string; reopenedByUserId: string; motivo: string },
  ): Promise<PeriodoFiscalReopening> {
    return tx.periodoFiscalReopening.create({ data });
  }
}
