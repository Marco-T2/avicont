import { Injectable } from '@nestjs/common';
import type { ArranqueConciliado, ArranquePartidaAbierta, Prisma } from '@prisma/client';

import { PrismaService } from '@/common/prisma.service';

import {
  ArranqueConciliadoCreateData,
  ArranqueConciliadoRepositoryPort,
} from '../ports/arranque-conciliado.repository.port';

/**
 * Adapter Prisma de `ArranqueConciliadoRepositoryPort`.
 *
 * Query builder plano — sin update ni delete: el arranque es append-only
 * (REQ-ICB-04). `vigenteA` es un `findFirst` sobre el índice compuesto
 * `(organizationId, cuentaBancariaId, fecha)` (design D3).
 * Toda query filtra `organizationId` (Anti-31, defense in depth).
 */
@Injectable()
export class PrismaArranqueConciliadoRepository extends ArranqueConciliadoRepositoryPort {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async crear(
    tenantId: string,
    data: ArranqueConciliadoCreateData,
    tx?: Prisma.TransactionClient,
  ): Promise<ArranqueConciliado> {
    const { partidasAbiertas, ...acto } = data;
    const client = tx ?? this.prisma;
    return client.arranqueConciliado.create({
      data: {
        organizationId: tenantId,
        ...acto,
        // Nested create: el acto y sus partidas congeladas entran en la MISMA
        // sentencia. Un arranque persistido a medias daría informes que
        // cierran de mentira — el `organizationId` se repite en la hija para
        // que el filtro de tenant no dependa del join (Anti-31).
        partidasAbiertas: {
          create: partidasAbiertas.map((partida) => ({
            organizationId: tenantId,
            ...partida,
          })),
        },
      },
    });
  }

  async listarPartidasAbiertas(
    tenantId: string,
    arranqueId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<ArranquePartidaAbierta[]> {
    const client = tx ?? this.prisma;
    return client.arranquePartidaAbierta.findMany({
      where: { organizationId: tenantId, arranqueId },
      orderBy: [{ fecha: 'asc' }, { id: 'asc' }],
    });
  }

  async vigenteA(
    tenantId: string,
    cuentaBancariaId: string,
    corte: Date,
    tx?: Prisma.TransactionClient,
  ): Promise<ArranqueConciliado | null> {
    const client = tx ?? this.prisma;
    // `fecha <= corte ORDER BY fecha DESC, createdAt DESC LIMIT 1` (D3/D8).
    return client.arranqueConciliado.findFirst({
      where: { organizationId: tenantId, cuentaBancariaId, fecha: { lte: corte } },
      orderBy: [{ fecha: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async listarHistorial(
    tenantId: string,
    cuentaBancariaId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<ArranqueConciliado[]> {
    const client = tx ?? this.prisma;
    return client.arranqueConciliado.findMany({
      where: { organizationId: tenantId, cuentaBancariaId },
      orderBy: [{ fecha: 'desc' }, { createdAt: 'desc' }],
    });
  }
}
