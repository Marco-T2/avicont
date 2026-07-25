import { Injectable } from '@nestjs/common';
import type { ArranqueConciliado, Prisma } from '@prisma/client';

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
    const client = tx ?? this.prisma;
    return client.arranqueConciliado.create({
      data: { organizationId: tenantId, ...data },
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
