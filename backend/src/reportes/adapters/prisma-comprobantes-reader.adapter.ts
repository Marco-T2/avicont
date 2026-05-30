import { Injectable } from '@nestjs/common';
import { EstadoComprobante } from '@prisma/client';

import { PrismaService } from '@/common/prisma.service';

import type {
  ComprobanteLibroDiarioRow,
  LibroDiarioFiltros,
} from '../ports/comprobantes-reader.port';
import { ComprobantesReaderPort } from '../ports/comprobantes-reader.port';

/**
 * Adapter Prisma para `ComprobantesReaderPort`.
 *
 * Design decisión #2: `findMany` con include anidado (NO $queryRaw).
 * Design decisión #3: estado IN (CONTABILIZADO, BLOQUEADO) FIJO; BORRADOR nunca parametrizable.
 * Design decisión #4 (§4.2 CLAUDE.md): todo where incluye organizationId — defense in depth.
 */
@Injectable()
export class PrismaComprobantesReaderAdapter extends ComprobantesReaderPort {
  // Estados siempre incluidos (REQ-LD-02). BORRADOR excluido por invariante de negocio.
  private static readonly ESTADOS_LIBRO: EstadoComprobante[] = [
    EstadoComprobante.CONTABILIZADO,
    EstadoComprobante.BLOQUEADO,
  ];

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async contarAsientos(tenantId: string, filtros: LibroDiarioFiltros): Promise<number> {
    return this.prisma.comprobante.count({
      where: this.buildWhere(tenantId, filtros),
    });
  }

  async obtenerAsientosParaLibroDiario(
    tenantId: string,
    filtros: LibroDiarioFiltros,
  ): Promise<ComprobanteLibroDiarioRow[]> {
    // findMany tipado con include anidado (design decisión #2).
    // Orden estable: fechaContable ASC, numero ASC NULLS LAST, createdAt ASC (REQ-LD-04).
    // numero es NULLS LAST defensivo aunque BORRADOR esté excluido (nunca NULL
    // en CONTABILIZADO/BLOQUEADO, pero el sort es safe ante estados futuros).
    return this.prisma.comprobante.findMany({
      where: this.buildWhere(tenantId, filtros),
      select: {
        id: true,
        organizationId: true,
        tipo: true,
        numero: true,
        estado: true,
        fechaContable: true,
        glosa: true,
        anulado: true,
        lineas: {
          select: {
            orden: true,
            glosaLinea: true,
            debitoBob: true,
            creditoBob: true,
            cuenta: {
              select: {
                codigoInterno: true,
                nombre: true,
              },
            },
          },
          orderBy: { orden: 'asc' },
        },
      },
      orderBy: [
        { fechaContable: 'asc' },
        // numero correlativo: desempate principal dentro del mismo día (REQ-LD-04, design decisión #2).
        // NULLS LAST defensivo: BORRADOR no tiene numero, pero quedan fuera del estado IN;
        // aun así el sort es safe ante estados futuros o datos edge.
        { numero: { sort: 'asc', nulls: 'last' } },
        // createdAt: desempate final si dos asientos tienen misma fecha y mismo numero
        // (en la práctica imposible por el UNIQUE del correlativo, pero seguro).
        { createdAt: 'asc' },
      ],
    });
  }

  private buildWhere(tenantId: string, filtros: LibroDiarioFiltros) {
    // Defense in depth (CLAUDE.md §4.2): organizationId SIEMPRE en el where.
    // No confiamos en que el caller ya lo filtró.
    const anulados = filtros.incluirAnulados ? {} : { anulado: false };

    return {
      organizationId: tenantId,
      estado: { in: PrismaComprobantesReaderAdapter.ESTADOS_LIBRO },
      fechaContable: {
        gte: filtros.fechaDesde,
        lte: filtros.fechaHasta,
      },
      ...anulados,
    };
  }
}
