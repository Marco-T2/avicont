/**
 * Adapter Prisma del LoteResumenReaderPort — read-model batch (anti-N×2).
 *
 * Estrategia (design.md §6):
 *   1. groupBy MovimientoCantidad WHERE loteId IN (…) → totalMuertes por lote
 *   2. groupBy MovimientoInversion WHERE loteId IN (…) → totalInversionBob por lote
 * Total: 2 queries constantes sin importar N. Los índices @@index([organizationId, loteId])
 * en cada tabla de movimiento sirven estas queries.
 *
 * CLAUDE.md §4.2 — defense in depth: TODA query filtra por organizationId.
 */

import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import { PrismaService } from '@/common/prisma.service';

import { LoteAgregados, LoteResumenReaderPort } from '../ports/lote-resumen-reader.port';

@Injectable()
export class PrismaLoteResumenReader extends LoteResumenReaderPort {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  /**
   * ★ MÉTODO ESTRELLA (design.md §6 — anti-N×2).
   * 2 queries groupBy para N lotes.
   * Retorna agregados para TODOS los loteIds, incluyendo lotes sin movimientos
   * (fallback a ceros — LEFT JOIN semántico).
   */
  async agregadosPorLotes(
    organizationId: string,
    loteIds: string[],
    tx?: Prisma.TransactionClient,
  ): Promise<LoteAgregados[]> {
    // Caso borde: lista vacía → 0 queries
    if (loteIds.length === 0) return [];

    const client = tx ?? this.prisma;

    // Query 1: totalMuertes por lote (MovimientoCantidad groupBy)
    const muertesAgregadas = await client.movimientoCantidad.groupBy({
      by: ['loteId'],
      where: { organizationId, loteId: { in: loteIds } },
      _sum: { cantidad: true },
    });

    // Query 2: totalInversionBob por lote (MovimientoInversion groupBy)
    const inversionesAgregadas = await client.movimientoInversion.groupBy({
      by: ['loteId'],
      where: { organizationId, loteId: { in: loteIds } },
      _sum: { monto: true },
    });

    // Construir Maps para O(1) lookup
    const muertesMap = new Map<string, number>();
    for (const r of muertesAgregadas) {
      muertesMap.set(r.loteId, r._sum.cantidad ?? 0);
    }

    const inversionesMap = new Map<string, string>();
    for (const r of inversionesAgregadas) {
      const total = r._sum.monto;
      inversionesMap.set(r.loteId, total !== null ? total.toString() : '0');
    }

    // Combinar: todos los loteIds solicitados tienen entrada (LEFT JOIN semántico)
    return loteIds.map(
      (loteId): LoteAgregados => ({
        loteId,
        totalMuertes: muertesMap.get(loteId) ?? 0,
        totalInversionBob: inversionesMap.get(loteId) ?? '0',
      }),
    );
  }
}
