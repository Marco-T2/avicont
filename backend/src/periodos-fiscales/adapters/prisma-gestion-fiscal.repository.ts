import { Injectable } from '@nestjs/common';
import { GestionFiscal, GestionFiscalStatus, Prisma } from '@prisma/client';

import { PrismaService } from '@/common/prisma.service';

import {
  CrearGestionData,
  CrearPeriodoData,
  GestionConPeriodos,
  GestionFiscalRepositoryPort,
} from '../ports/gestion-fiscal.repository.port';
import { GestionesReaderPort } from '../ports/gestiones-reader.port';

@Injectable()
export class PrismaGestionFiscalRepository
  extends GestionFiscalRepositoryPort
  implements GestionesReaderPort
{
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  findByYear(organizationId: string, year: number): Promise<GestionFiscal | null> {
    return this.prisma.gestionFiscal.findUnique({
      where: { organizationId_year: { organizationId, year } },
    });
  }

  findByIdWithPeriodos(id: string, organizationId: string): Promise<GestionConPeriodos | null> {
    return this.prisma.gestionFiscal.findFirst({
      where: { id, organizationId },
      include: { periodos: { orderBy: { ordenEnGestion: 'asc' } } },
    });
  }

  listByOrganization(
    organizationId: string,
    filters: { status?: GestionFiscalStatus } = {},
  ): Promise<GestionFiscal[]> {
    return this.prisma.gestionFiscal.findMany({
      where: {
        organizationId,
        ...(filters.status !== undefined ? { status: filters.status } : {}),
      },
      orderBy: { year: 'desc' },
    });
  }

  async existsForOrganization(organizationId: string): Promise<boolean> {
    const found = await this.prisma.gestionFiscal.findFirst({
      where: { organizationId },
      select: { id: true },
    });
    return found !== null;
  }

  // Implementa `GestionesReaderPort` — mismo concepto, nombre más intencional
  // desde la perspectiva del consumidor (tenants.service).
  existeAlgunaGestion(organizationId: string): Promise<boolean> {
    return this.existsForOrganization(organizationId);
  }

  async crearGestionConPeriodos(
    tx: Prisma.TransactionClient,
    gestion: CrearGestionData,
    periodos: CrearPeriodoData[],
  ): Promise<GestionConPeriodos> {
    const created = await tx.gestionFiscal.create({
      data: {
        organizationId: gestion.organizationId,
        year: gestion.year,
        mesInicio: gestion.mesInicio,
        status: 'ABIERTA',
      },
    });

    await tx.periodoFiscal.createMany({
      data: periodos.map((p) => ({
        organizationId: p.organizationId,
        gestionId: created.id,
        year: p.year,
        month: p.month,
        ordenEnGestion: p.ordenEnGestion,
        status: 'ABIERTO',
      })),
    });

    const result = await tx.gestionFiscal.findFirstOrThrow({
      where: { id: created.id, organizationId: gestion.organizationId },
      include: { periodos: { orderBy: { ordenEnGestion: 'asc' } } },
    });
    return result;
  }

  cerrarGestion(
    tx: Prisma.TransactionClient,
    id: string,
    organizationId: string,
    userId: string,
  ): Promise<GestionFiscal> {
    return tx.gestionFiscal.update({
      where: { id, organizationId },
      data: {
        status: 'CERRADA',
        closedAt: new Date(),
        closedByUserId: userId,
      },
    });
  }
}
