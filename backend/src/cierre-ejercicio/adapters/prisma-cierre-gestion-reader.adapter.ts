import { Injectable } from '@nestjs/common';
import { PeriodoFiscalStatus, type Prisma } from '@prisma/client';

import { PrismaService } from '@/common/prisma.service';

import {
  type GestionParaCierre,
  CierreGestionReaderPort,
} from '../ports/cierre-gestion-reader.port';

/**
 * Los 3 valores de `origenTipo` que marcan un comprobante como pieza de cierre
 * de una gestión. La idempotencia (REQ-CE-09) se apoya en
 * `@@unique([organizationId, origenTipo, origenId])` con `origenId=gestionId`.
 */
const ORIGENES_CIERRE = ['CIERRE_GASTOS', 'CIERRE_INGRESOS', 'CIERRE_RESULTADO'] as const;

/** Primer día del mes a medianoche UTC (`@db.Date`). */
function primerDiaDelMes(year: number, month: number): Date {
  return new Date(Date.UTC(year, month - 1, 1));
}

/** Último día del mes a medianoche UTC (`@db.Date`). `Date.UTC(y, m, 0)` = día 0 del mes siguiente. */
function ultimoDiaDelMes(year: number, month: number): Date {
  return new Date(Date.UTC(year, month, 0));
}

/**
 * Adapter de `CierreGestionReaderPort`. Lee la gestión, sus períodos y los
 * comprobantes de cierre ya generados en una sola pasada. organizationId
 * SIEMPRE primer predicado (§4.2 Anti-31).
 */
@Injectable()
export class PrismaCierreGestionReaderAdapter extends CierreGestionReaderPort {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async obtenerParaCierre(
    gestionId: string,
    tenantId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<GestionParaCierre | null> {
    const client = tx ?? this.prisma;
    const gestion = await client.gestionFiscal.findFirst({
      where: { id: gestionId, organizationId: tenantId },
      select: {
        id: true,
        year: true,
        status: true,
        periodos: {
          select: { id: true, year: true, month: true, ordenEnGestion: true, status: true },
          orderBy: { ordenEnGestion: 'asc' },
        },
      },
    });

    if (gestion === null) {
      return null;
    }

    // El mesCierre es el último período de la gestión (ordenEnGestion máximo,
    // normalmente 12). Ley 843 art. 46: la gestión dura 12 meses.
    const periodoMesCierre = gestion.periodos.reduce(
      (max, p) => (max === null || p.ordenEnGestion > max.ordenEnGestion ? p : max),
      gestion.periodos[0] ?? null,
    );

    if (periodoMesCierre === undefined || periodoMesCierre === null) {
      // Gestión sin períodos: estado inconsistente; tratamos como no lista.
      const cero = new Date(Date.UTC(gestion.year, 0, 1));
      return {
        id: gestion.id,
        year: gestion.year,
        status: gestion.status,
        periodosCount: 0,
        periodosCerradosCount: 0,
        periodoMesCierre: {
          id: '',
          year: gestion.year,
          month: 0,
          estaAbierto: false,
          fechaCierre: cero,
        },
        rangoGestion: { desde: cero, hasta: cero },
        comprobantesDeCierre: [],
      };
    }

    const periodoInicio = gestion.periodos.reduce(
      (min, p) => (p.ordenEnGestion < min.ordenEnGestion ? p : min),
      gestion.periodos[0] ?? periodoMesCierre,
    );

    const periodosCerradosCount = gestion.periodos.filter(
      (p) => p.status === PeriodoFiscalStatus.CERRADO,
    ).length;

    const comprobantesDeCierre = await client.comprobante.findMany({
      where: {
        organizationId: tenantId,
        origenId: gestionId,
        origenTipo: { in: [...ORIGENES_CIERRE] },
      },
      select: { id: true, origenTipo: true, estado: true },
    });

    return {
      id: gestion.id,
      year: gestion.year,
      status: gestion.status,
      periodosCount: gestion.periodos.length,
      periodosCerradosCount,
      periodoMesCierre: {
        id: periodoMesCierre.id,
        year: periodoMesCierre.year,
        month: periodoMesCierre.month,
        estaAbierto: periodoMesCierre.status === PeriodoFiscalStatus.ABIERTO,
        fechaCierre: ultimoDiaDelMes(periodoMesCierre.year, periodoMesCierre.month),
      },
      rangoGestion: {
        desde: primerDiaDelMes(periodoInicio.year, periodoInicio.month),
        hasta: ultimoDiaDelMes(periodoMesCierre.year, periodoMesCierre.month),
      },
      comprobantesDeCierre: comprobantesDeCierre.map((c) => ({
        id: c.id,
        // origenTipo nunca es null aquí (lo filtramos por IN), pero el tipo Prisma
        // lo declara nullable — narrowing defensivo.
        origenTipo: c.origenTipo ?? '',
        estado: c.estado,
      })),
    };
  }
}
