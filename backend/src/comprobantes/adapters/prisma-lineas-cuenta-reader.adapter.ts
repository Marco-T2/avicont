import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { ESTADOS_CONCILIABLES } from '@/common/estados-comprobante';

import { PrismaService } from '@/common/prisma.service';

import {
  AnclaLinea,
  LineaCuentaRow,
  LineasCuentaFiltros,
  LineasCuentaReaderPort,
  SumaLineasCuentaFiltros,
  SumaLineasCuentaRow,
} from '../ports/lineas-cuenta-reader.port';

// Shape del `findMany` con el include de cabecera — evita repetirlo en los 2 métodos.
type FilaConComprobante = Prisma.LineaComprobanteGetPayload<{
  include: {
    comprobante: {
      select: {
        numero: true;
        glosa: true;
        fechaContable: true;
        estado: true;
        anulado: true;
      };
    };
  };
}>;

const INCLUDE_CABECERA = {
  comprobante: {
    select: {
      numero: true,
      glosa: true,
      fechaContable: true,
      estado: true,
      anulado: true,
    },
  },
} as const;

/**
 * Adapter Prisma de `LineasCuentaReaderPort`.
 *
 * Usa el QUERY BUILDER, no `$queryRaw` (design §3): a diferencia de
 * `LibroMayorReaderPort` — que hace `GROUP BY` con agregados y por eso paga
 * raw — acá es una lectura filtrada plana. El builder devuelve `Decimal`
 * tipado sin el remapeo `string → Decimal` a mano, y deja el filtro de tenant
 * estáticamente visible en el `where`.
 */
@Injectable()
export class PrismaLineasCuentaReaderAdapter extends LineasCuentaReaderPort {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async listarPorCuentaEnRango(
    tenantId: string,
    filtros: LineasCuentaFiltros,
  ): Promise<LineaCuentaRow[]> {
    const filas = await this.prisma.lineaComprobante.findMany({
      where: {
        organizationId: tenantId,
        cuentaId: filtros.cuentaId,
        comprobante: {
          organizationId: tenantId, // defense in depth (Anti-31)
          estado: { in: [...ESTADOS_CONCILIABLES] },
          anulado: false,
          fechaContable: { gte: filtros.fechaDesde, lte: filtros.fechaHasta },
        },
      },
      include: INCLUDE_CABECERA,
      orderBy: [
        { comprobante: { fechaContable: 'asc' } },
        { comprobante: { numero: { sort: 'asc', nulls: 'last' } } },
        { comprobanteId: 'asc' },
        { orden: 'asc' },
      ],
    });

    return filas.map(toLineaCuentaRow);
  }

  async listarPorAnclas(
    tenantId: string,
    anclas: ReadonlyArray<AnclaLinea>,
  ): Promise<LineaCuentaRow[]> {
    if (anclas.length === 0) return [];

    // Sin filtro de `estado`/`anulado` a propósito: este método existe para
    // DIAGNOSTICAR por qué se rompió un vínculo (design §2.2) — distinguir
    // "la línea no existe" de "el comprobante fue anulado" exige poder ver la
    // línea anulada. El `OR` de anclas pega contra `@@unique([comprobanteId, orden])`.
    const filas = await this.prisma.lineaComprobante.findMany({
      where: {
        organizationId: tenantId,
        comprobante: { organizationId: tenantId }, // defense in depth (Anti-31)
        OR: anclas.map((a) => ({ comprobanteId: a.comprobanteId, orden: a.orden })),
      },
      include: INCLUDE_CABECERA,
    });

    return filas.map(toLineaCuentaRow);
  }

  async sumarPorCuentaHasta(
    tenantId: string,
    filtros: SumaLineasCuentaFiltros,
  ): Promise<SumaLineasCuentaRow> {
    // `aggregate({_sum})`, NO `$queryRaw` (design informe-conciliacion-bancaria
    // D1): el builder conserva el filtro de tenant estáticamente visible y
    // devuelve `Decimal` tipado sin el remapeo `string → Decimal` del raw.
    const agregado = await this.prisma.lineaComprobante.aggregate({
      _sum: { debito: true, credito: true, debitoBob: true, creditoBob: true },
      where: {
        organizationId: tenantId,
        cuentaId: filtros.cuentaId,
        comprobante: {
          organizationId: tenantId, // defense in depth (Anti-31)
          estado: { in: [...ESTADOS_CONCILIABLES] },
          anulado: false,
          fechaContable: {
            lte: filtros.hasta,
            // `desde` EXCLUSIVO — ventana D3 `arranque.fecha < fecha <= corte`.
            ...(filtros.desde !== undefined ? { gt: filtros.desde } : {}),
          },
        },
      },
    });

    // Sin filas, `_sum` viene con null en cada campo — el contrato promete
    // ceros Decimal, nunca null.
    const CERO = new Prisma.Decimal(0);
    return {
      totalDebito: agregado._sum.debito ?? CERO,
      totalCredito: agregado._sum.credito ?? CERO,
      totalDebitoBob: agregado._sum.debitoBob ?? CERO,
      totalCreditoBob: agregado._sum.creditoBob ?? CERO,
    };
  }
}

function toLineaCuentaRow(fila: FilaConComprobante): LineaCuentaRow {
  return {
    comprobanteId: fila.comprobanteId,
    orden: fila.orden,
    cuentaId: fila.cuentaId,
    fechaContable: fila.comprobante.fechaContable,
    moneda: fila.moneda,
    debito: fila.debito,
    credito: fila.credito,
    debitoBob: fila.debitoBob,
    creditoBob: fila.creditoBob,
    glosa: fila.comprobante.glosa,
    glosaLinea: fila.glosaLinea,
    numeroComprobante: fila.comprobante.numero,
    estado: fila.comprobante.estado,
    anulado: fila.comprobante.anulado,
  };
}
