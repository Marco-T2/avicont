import { Injectable } from '@nestjs/common';
import type { MatchConciliacion, Prisma } from '@prisma/client';

import { PrismaService } from '@/common/prisma.service';

import {
  MatchConciliacionCreateData,
  MatchConciliacionRepositoryPort,
} from '../ports/match-conciliacion.repository.port';

@Injectable()
export class PrismaMatchConciliacionRepository extends MatchConciliacionRepositoryPort {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async crear(
    tenantId: string,
    data: MatchConciliacionCreateData,
    tx?: Prisma.TransactionClient,
  ): Promise<MatchConciliacion> {
    const client = tx ?? this.prisma;
    return client.matchConciliacion.create({
      data: {
        organizationId: tenantId,
        movimientoBancarioId: data.movimientoBancarioId,
        comprobanteId: data.comprobanteId,
        orden: data.orden,
        snapshotCuentaId: data.snapshotCuentaId,
        snapshotMonto: data.snapshotMonto,
        snapshotTipo: data.snapshotTipo,
        snapshotMoneda: data.snapshotMoneda,
        snapshotFecha: data.snapshotFecha,
        confianzaSugerida: data.confianzaSugerida,
        conciliadoPorUserId: data.conciliadoPorUserId,
      },
    });
  }

  async findById(
    tenantId: string,
    id: string,
    tx?: Prisma.TransactionClient,
  ): Promise<MatchConciliacion | null> {
    const client = tx ?? this.prisma;
    return client.matchConciliacion.findFirst({
      where: { id, organizationId: tenantId },
    });
  }

  async findByMovimiento(
    tenantId: string,
    movimientoBancarioId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<MatchConciliacion | null> {
    const client = tx ?? this.prisma;
    return client.matchConciliacion.findFirst({
      where: { organizationId: tenantId, movimientoBancarioId },
    });
  }

  async findByAncla(
    tenantId: string,
    comprobanteId: string,
    orden: number,
    tx?: Prisma.TransactionClient,
  ): Promise<MatchConciliacion | null> {
    const client = tx ?? this.prisma;
    return client.matchConciliacion.findFirst({
      where: { organizationId: tenantId, comprobanteId, orden },
    });
  }

  async listarPorMovimientos(
    tenantId: string,
    movimientoBancarioIds: readonly string[],
    tx?: Prisma.TransactionClient,
  ): Promise<MatchConciliacion[]> {
    if (movimientoBancarioIds.length === 0) return [];
    const client = tx ?? this.prisma;
    return client.matchConciliacion.findMany({
      where: {
        organizationId: tenantId,
        movimientoBancarioId: { in: [...movimientoBancarioIds] },
      },
    });
  }

  async listarPorAnclas(
    tenantId: string,
    anclas: ReadonlyArray<{ comprobanteId: string; orden: number }>,
    tx?: Prisma.TransactionClient,
  ): Promise<MatchConciliacion[]> {
    if (anclas.length === 0) return [];
    const client = tx ?? this.prisma;
    return client.matchConciliacion.findMany({
      where: {
        organizationId: tenantId,
        OR: anclas.map((a) => ({ comprobanteId: a.comprobanteId, orden: a.orden })),
      },
    });
  }

  async eliminar(tenantId: string, id: string, tx?: Prisma.TransactionClient): Promise<void> {
    const client = tx ?? this.prisma;
    // deleteMany (no delete) para que el filtro de tenant viaje en el WHERE:
    // `delete` exige un unique y dejaría el organizationId fuera (Anti-31).
    await client.matchConciliacion.deleteMany({ where: { id, organizationId: tenantId } });
  }
}
