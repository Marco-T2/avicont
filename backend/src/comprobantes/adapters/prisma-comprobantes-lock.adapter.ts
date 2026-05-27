import { Injectable } from '@nestjs/common';
import { EstadoComprobante, Prisma } from '@prisma/client';

import { FechaContable } from '@/common/domain/fecha-contable';

import { ComprobantesLockPort, ResumenPeriodo } from '../ports/comprobantes-lock.port';

/**
 * Adapter real del `ComprobantesLockPort` (Fase 1.3). Reemplaza al
 * `NoopComprobantesLockAdapter` que vivía en `PeriodosFiscalesModule`
 * desde Fase 1.2.
 *
 * Toda operación recibe el `tx` del caller y se ejecuta contra él — por
 * diseño del port, las transiciones CONTABILIZADO↔BLOQUEADO del período
 * suceden atómicamente con el cambio de estado del `PeriodoFiscal`
 * (§4.4 CLAUDE.md core, Anti-12: validación del cierre DENTRO de la TX).
 *
 * Por ese motivo el adapter no necesita `PrismaService` inyectado — el
 * tx ya trae todos los métodos.
 */
@Injectable()
export class PrismaComprobantesLockAdapter extends ComprobantesLockPort {
  async bloquearPorPeriodo(tx: Prisma.TransactionClient, periodoId: string): Promise<number> {
    const res = await tx.comprobante.updateMany({
      where: {
        periodoFiscalId: periodoId,
        estado: EstadoComprobante.CONTABILIZADO,
      },
      data: { estado: EstadoComprobante.BLOQUEADO },
    });
    return res.count;
  }

  async desbloquearPorPeriodo(tx: Prisma.TransactionClient, periodoId: string): Promise<number> {
    const res = await tx.comprobante.updateMany({
      where: {
        periodoFiscalId: periodoId,
        estado: EstadoComprobante.BLOQUEADO,
      },
      data: { estado: EstadoComprobante.CONTABILIZADO },
    });
    return res.count;
  }

  async contarBorradoresEnPeriodo(
    tx: Prisma.TransactionClient,
    periodoId: string,
  ): Promise<number> {
    return tx.comprobante.count({
      where: {
        periodoFiscalId: periodoId,
        estado: EstadoComprobante.BORRADOR,
      },
    });
  }

  async obtenerResumenEnPeriodo(
    tx: Prisma.TransactionClient,
    periodoId: string,
  ): Promise<ResumenPeriodo> {
    // Tres queries en paralelo — la TX del caller garantiza coherencia del
    // snapshot bajo isolation level default (READ COMMITTED). Si un writer
    // concurrente agrega comprobantes entre las queries, la foto puede
    // quedar ligeramente inconsistente en counts vs sumas, pero nunca en
    // forma que corrompa datos: es una lectura para UX pre-cierre y el
    // caller va a hacer el cierre real bajo su propia TX con row locks.
    const [contadores, totales, borradoresList] = await Promise.all([
      tx.comprobante.groupBy({
        by: ['estado'],
        where: { periodoFiscalId: periodoId },
        _count: { _all: true },
      }),
      tx.comprobante.aggregate({
        where: {
          periodoFiscalId: periodoId,
          estado: EstadoComprobante.CONTABILIZADO,
        },
        _sum: { totalDebitoBob: true, totalCreditoBob: true },
      }),
      tx.comprobante.findMany({
        where: {
          periodoFiscalId: periodoId,
          estado: EstadoComprobante.BORRADOR,
        },
        select: {
          id: true,
          fechaContable: true,
          glosa: true,
          totalDebitoBob: true,
        },
        orderBy: { fechaContable: 'asc' },
        take: 50,
      }),
    ]);

    const countPor = (e: EstadoComprobante): number =>
      contadores.find((c) => c.estado === e)?._count._all ?? 0;

    return {
      contabilizados: countPor(EstadoComprobante.CONTABILIZADO),
      borradores: countPor(EstadoComprobante.BORRADOR),
      // TODO sdd:comprobantes-anulacion-refactor task 1.1 — anulados was previously
      // counted as EstadoComprobante.ANULADO (state). Post-refactor anulados are
      // determined by the flag anulado=true, not a state. This field will be
      // recalculated in task 5.5/6.3 when the adapter is rewritten. Returns 0 now.
      anulados: 0,
      totalDebeBob: (totales._sum.totalDebitoBob ?? new Prisma.Decimal(0)).toFixed(2),
      totalHaberBob: (totales._sum.totalCreditoBob ?? new Prisma.Decimal(0)).toFixed(2),
      borradoresList: borradoresList.map((b) => ({
        id: b.id,
        fechaContable: FechaContable.fromDbDate(b.fechaContable).toIso(),
        glosa: b.glosa,
        totalBob: b.totalDebitoBob.toFixed(2),
      })),
    };
  }
}
