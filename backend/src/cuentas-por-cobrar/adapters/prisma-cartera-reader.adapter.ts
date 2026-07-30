import { Injectable } from '@nestjs/common';
import { CondicionPago, type Prisma } from '@prisma/client';

import { Money } from '@/common/domain/money';
import { ESTADOS_CONCILIABLES } from '@/common/estados-comprobante';
import { PrismaService } from '@/common/prisma.service';
import {
  ORIGEN_TIPO_COBRO,
  ORIGEN_TIPO_VENTA,
} from '@/comprobantes/ports/comprobante-sistema-writer.port';

import { CarteraReaderPort, CobroCarteraRow, VentaCarteraRow } from '../ports/cartera-reader.port';

/**
 * Adapter Prisma de `CarteraReaderPort`.
 *
 * La Σ de aplicaciones sale por `groupBy` + `_sum` del query builder, NO por
 * `$queryRaw`: es el precedente de la casa para esta misma suma
 * (`listarVentasEnCartera` en `ventas/`), devuelve `Decimal` tipado sin el
 * remapeo `string → Decimal` a mano y deja el filtro de tenant estáticamente
 * visible en el `where` (mismo argumento que `PrismaLineasCuentaReaderAdapter`;
 * el repo paga raw solo donde el builder no llega — `FILTER`, locks). El
 * `SUM()` bajo `FOR UPDATE` de REQ-CXC-04 es del repositorio de ESCRITURA,
 * no de esta lectura.
 *
 * El vínculo documento↔comprobante es el `@@unique(organizationId,
 * origenTipo, origenId)` — no hay FK a propósito, así que son dos queries y
 * una intersección en memoria (molde `obtenerComprobantesDeVentas`).
 */
@Injectable()
export class PrismaCarteraReaderAdapter extends CarteraReaderPort {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async listarVentasDeCartera(
    tenantId: string,
    contactoId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<VentaCarteraRow[]> {
    const client = tx ?? this.prisma;
    const ventas = await client.venta.findMany({
      where: {
        organizationId: tenantId,
        contactoId,
        // REQ-VTA-04 / D-04: una CONTADO no crea partida abierta. Filtrar por
        // contacto a secas la colaría — su línea de débito también lleva
        // contactoId (el Mayor de Caja documenta quién pagó).
        condicionPago: CondicionPago.CREDITO,
      },
      select: {
        id: true,
        fechaContable: true,
        fechaVencimiento: true,
        createdAt: true,
        montoTotal: true,
      },
      // Orden canónico FIFO (REQ-CXC-05) — mismo criterio y desempate que
      // `ordenarCarteraFifo` del dominio; el porqué de cada término vive en
      // el JSDoc del port.
      orderBy: [{ fechaContable: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
    });
    if (ventas.length === 0) return [];

    const ventaIds = ventas.map((v) => v.id);
    const [conciliables, sumas] = await Promise.all([
      // "¿Esta venta cuenta?" = plata efectivamente movida (§4.4): estado IN
      // (CONTABILIZADO, BLOQUEADO) AND anulado = false. NUNCA `CONTABILIZADO`
      // a secas — cerrar el período vaciaría la cartera del cliente.
      client.comprobante.findMany({
        where: {
          organizationId: tenantId,
          origenTipo: ORIGEN_TIPO_VENTA,
          origenId: { in: ventaIds },
          estado: { in: [...ESTADOS_CONCILIABLES] },
          anulado: false,
        },
        select: { origenId: true },
      }),
      this.sumarAplicaciones(client, tenantId, 'ventaId', ventaIds),
    ]);

    const enCartera = new Set(conciliables.map((c) => c.origenId));
    return ventas
      .filter((v) => enCartera.has(v.id))
      .map((v) => ({
        ventaId: v.id,
        fechaContable: v.fechaContable,
        fechaVencimiento: v.fechaVencimiento,
        createdAt: v.createdAt,
        montoTotal: Money.of(v.montoTotal),
        totalAplicado: sumas.get(v.id) ?? Money.ZERO,
      }));
  }

  async listarCobrosDeContacto(
    tenantId: string,
    contactoId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<CobroCarteraRow[]> {
    const client = tx ?? this.prisma;
    const cobros = await client.cobro.findMany({
      where: { organizationId: tenantId, contactoId },
      select: { id: true, monto: true },
      orderBy: [{ fechaContable: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
    });
    if (cobros.length === 0) return [];

    const cobroIds = cobros.map((c) => c.id);
    const [conciliables, sumas] = await Promise.all([
      // Mismo predicado que la cartera: un cobro en BORRADOR no movió plata y
      // uno anulado dejó de moverla — ninguno otorga saldo a favor (§4.7).
      client.comprobante.findMany({
        where: {
          organizationId: tenantId,
          origenTipo: ORIGEN_TIPO_COBRO,
          origenId: { in: cobroIds },
          estado: { in: [...ESTADOS_CONCILIABLES] },
          anulado: false,
        },
        select: { origenId: true },
      }),
      this.sumarAplicaciones(client, tenantId, 'cobroId', cobroIds),
    ]);

    const cuentan = new Set(conciliables.map((c) => c.origenId));
    return cobros
      .filter((c) => cuentan.has(c.id))
      .map((c) => ({
        cobroId: c.id,
        monto: Money.of(c.monto),
        totalAplicado: sumas.get(c.id) ?? Money.ZERO,
      }));
  }

  /** Σ `montoAplicado` por venta o por cobro, indexada por ese id. */
  private async sumarAplicaciones(
    client: Prisma.TransactionClient | PrismaService,
    tenantId: string,
    porCampo: 'ventaId' | 'cobroId',
    ids: string[],
  ): Promise<Map<string, Money>> {
    const sumas = await client.aplicacionCobro.groupBy({
      by: [porCampo],
      where: { organizationId: tenantId, [porCampo]: { in: ids } },
      _sum: { montoAplicado: true },
    });
    return new Map(sumas.map((s) => [s[porCampo], Money.of(s._sum.montoAplicado ?? 0)]));
  }
}
