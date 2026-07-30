import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { ESTADOS_CONCILIABLES } from '@/common/estados-comprobante';
import { PrismaService } from '@/common/prisma.service';
import { ORIGEN_TIPO_VENTA } from '@/comprobantes/ports/comprobante-sistema-writer.port';

import {
  AplicacionDeVenta,
  ComprobanteDeVenta,
  LineaVentaData,
  Venta,
  VentaConLineas,
  VentaCreateData,
  VentaEnCartera,
  VentaListarFiltros,
  VentaListarPagination,
  VentaReemplazoData,
  VentaRepositoryPort,
} from '../ports/venta.repository.port';

/** Las líneas siempre vuelven en su orden del documento. */
const INCLUDE_LINEAS = { lineas: { orderBy: { orden: 'asc' } } } as const;

@Injectable()
export class PrismaVentaRepository extends VentaRepositoryPort {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async crear(
    tenantId: string,
    data: VentaCreateData,
    tx: Prisma.TransactionClient,
  ): Promise<VentaConLineas> {
    return tx.venta.create({
      data: {
        organizationId: tenantId,
        contactoId: data.contactoId,
        fechaContable: data.fechaContable,
        condicionPago: data.condicionPago,
        fechaVencimiento: data.fechaVencimiento,
        glosa: data.glosa,
        montoTotal: data.montoTotal,
        createdByUserId: data.createdByUserId,
        lineas: { create: this.aLineasCreate(tenantId, data.lineas) },
      },
      include: INCLUDE_LINEAS,
    });
  }

  async reemplazar(
    tenantId: string,
    ventaId: string,
    data: VentaReemplazoData,
    tx: Prisma.TransactionClient,
  ): Promise<VentaConLineas> {
    // Borrado físico + re-insert en bloque (§4.3): la cabecera preserva su
    // `id`. El deleteMany va scoped al tenant además del update (§4.2,
    // defense in depth): si la venta es ajena, el update de abajo lanza P2025
    // y la TX revierte el borrado — pero el filtro evita tocar filas ajenas
    // incluso ante un bug futuro en el update.
    await tx.lineaVenta.deleteMany({ where: { organizationId: tenantId, ventaId } });
    return tx.venta.update({
      where: { id: ventaId, organizationId: tenantId },
      data: {
        contactoId: data.contactoId,
        fechaContable: data.fechaContable,
        condicionPago: data.condicionPago,
        fechaVencimiento: data.fechaVencimiento,
        glosa: data.glosa,
        montoTotal: data.montoTotal,
        lineas: { create: this.aLineasCreate(tenantId, data.lineas) },
      },
      include: INCLUDE_LINEAS,
    });
  }

  async eliminar(tenantId: string, ventaId: string, tx: Prisma.TransactionClient): Promise<void> {
    // `delete` (no deleteMany) para que la venta ajena o inexistente lance
    // P2025 en vez de terminar en silencio. Las líneas cascadean.
    await tx.venta.delete({ where: { id: ventaId, organizationId: tenantId } });
  }

  async findById(
    tenantId: string,
    id: string,
    tx?: Prisma.TransactionClient,
  ): Promise<VentaConLineas | null> {
    const client = tx ?? this.prisma;
    return client.venta.findFirst({
      where: { id, organizationId: tenantId },
      include: INCLUDE_LINEAS,
    });
  }

  async listar(
    tenantId: string,
    filtros: VentaListarFiltros,
    pagination: VentaListarPagination,
    tx?: Prisma.TransactionClient,
  ): Promise<{ ventas: Venta[]; total: number }> {
    const client = tx ?? this.prisma;
    const where: Prisma.VentaWhereInput = {
      organizationId: tenantId,
      ...(filtros.contactoId !== undefined ? { contactoId: filtros.contactoId } : {}),
      ...(filtros.fechaDesde !== undefined || filtros.fechaHasta !== undefined
        ? {
            fechaContable: {
              ...(filtros.fechaDesde !== undefined ? { gte: filtros.fechaDesde } : {}),
              ...(filtros.fechaHasta !== undefined ? { lte: filtros.fechaHasta } : {}),
            },
          }
        : {}),
    };

    const skip = (pagination.page - 1) * pagination.limit;
    const [ventas, total] = await Promise.all([
      client.venta.findMany({
        where,
        orderBy: [{ fechaContable: 'desc' }, { createdAt: 'desc' }],
        skip,
        take: pagination.limit,
      }),
      client.venta.count({ where }),
    ]);
    return { ventas, total };
  }

  async obtenerComprobantesDeVentas(
    tenantId: string,
    ventaIds: string[],
    tx?: Prisma.TransactionClient,
  ): Promise<Map<string, ComprobanteDeVenta>> {
    if (ventaIds.length === 0) return new Map();
    const client = tx ?? this.prisma;
    // Lectura-proyección de la tabla de comprobantes (§3.7, patrón
    // cierre-gestion-reader): el vínculo es el @@unique
    // (organizationId, origenTipo, origenId) — no hay FK a propósito.
    const comprobantes = await client.comprobante.findMany({
      where: {
        organizationId: tenantId,
        origenTipo: ORIGEN_TIPO_VENTA,
        origenId: { in: ventaIds },
      },
      select: { id: true, numero: true, estado: true, anulado: true, origenId: true },
    });

    return new Map(
      comprobantes.map((c) => [
        // origenId nunca es null acá (filtrado por IN), pero el tipo Prisma
        // no lo sabe.
        c.origenId ?? '',
        { id: c.id, numero: c.numero, estado: c.estado, anulado: c.anulado },
      ]),
    );
  }

  async listarAplicaciones(
    tenantId: string,
    ventaId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<AplicacionDeVenta[]> {
    const client = tx ?? this.prisma;
    return client.aplicacionCobro.findMany({
      where: { organizationId: tenantId, ventaId },
      select: { id: true, cobroId: true, montoAplicado: true, createdAt: true },
      // LIFO (D-21): la más reciente primero. `id` desempata createdAt iguales
      // para que el recorte sea determinista.
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
  }

  async listarVentasEnCartera(
    tenantId: string,
    contactoId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<VentaEnCartera[]> {
    const client = tx ?? this.prisma;
    const ventas = await client.venta.findMany({
      where: { organizationId: tenantId, contactoId },
      orderBy: [{ fechaContable: 'asc' }, { createdAt: 'asc' }],
    });
    if (ventas.length === 0) return [];

    const ventaIds = ventas.map((v) => v.id);
    const [comprobantes, aplicaciones] = await Promise.all([
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
        select: { numero: true, origenId: true },
      }),
      client.aplicacionCobro.groupBy({
        by: ['ventaId'],
        where: { organizationId: tenantId, ventaId: { in: ventaIds } },
        _sum: { montoAplicado: true },
      }),
    ]);

    const numeroPorVenta = new Map(comprobantes.map((c) => [c.origenId ?? '', c.numero]));
    const aplicadoPorVenta = new Map(
      aplicaciones.map((a) => [a.ventaId, a._sum.montoAplicado ?? new Prisma.Decimal(0)]),
    );

    return ventas
      .filter((v) => numeroPorVenta.has(v.id))
      .map((venta) => ({
        venta,
        numero: numeroPorVenta.get(venta.id) ?? null,
        totalAplicado: aplicadoPorVenta.get(venta.id) ?? new Prisma.Decimal(0),
      }));
  }

  private aLineasCreate(
    tenantId: string,
    lineas: LineaVentaData[],
  ): Prisma.LineaVentaUncheckedCreateWithoutVentaInput[] {
    // `orden` 1-based por posición del array — el caller arma el documento,
    // no lleva la contabilidad de los índices (espejo del writer de sistema).
    // organizationId PROPIO en cada línea (REQ-VTA-08, §4.2).
    return lineas.map((linea, i) => ({
      organizationId: tenantId,
      orden: i + 1,
      itemId: linea.itemId,
      descripcion: linea.descripcion,
      cantidad: linea.cantidad,
      precioUnitario: linea.precioUnitario,
      cuentaIngresoId: linea.cuentaIngresoId,
      subtotal: linea.subtotal,
    }));
  }
}
