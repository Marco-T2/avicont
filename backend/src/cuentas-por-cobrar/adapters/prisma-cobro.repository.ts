import { Injectable } from '@nestjs/common';
import { type CondicionPago, Prisma } from '@prisma/client';

import { PrismaService } from '@/common/prisma.service';
import {
  ORIGEN_TIPO_COBRO,
  ORIGEN_TIPO_VENTA,
} from '@/comprobantes/ports/comprobante-sistema-writer.port';

import {
  AplicacionCobroRow,
  AplicacionCreateData,
  AplicacionDeCobro,
  AplicacionDesvinculadaData,
  Cobro,
  CobroActualizarData,
  CobroConAplicadoConLock,
  CobroCreateData,
  CobroListarFiltros,
  CobroListarPagination,
  CobroRepositoryPort,
  ComprobanteDeCobro,
  SumasAplicadasConLock,
  SumasAplicadasParams,
} from '../ports/cobro.repository.port';

@Injectable()
export class PrismaCobroRepository extends CobroRepositoryPort {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async crear(
    tenantId: string,
    data: CobroCreateData,
    tx: Prisma.TransactionClient,
  ): Promise<Cobro> {
    return tx.cobro.create({
      data: {
        organizationId: tenantId,
        contactoId: data.contactoId,
        fechaContable: data.fechaContable,
        monto: data.monto,
        cuentaDestinoId: data.cuentaDestinoId,
        glosa: data.glosa,
        createdByUserId: data.createdByUserId,
      },
    });
  }

  async actualizar(
    tenantId: string,
    cobroId: string,
    data: CobroActualizarData,
    tx: Prisma.TransactionClient,
  ): Promise<Cobro> {
    // `update` (no updateMany) para que el cobro ajeno o inexistente lance
    // P2025 en vez de terminar en silencio. El scope de tenant va en el
    // where (§4.2).
    return tx.cobro.update({
      where: { id: cobroId, organizationId: tenantId },
      data: {
        contactoId: data.contactoId,
        fechaContable: data.fechaContable,
        monto: data.monto,
        cuentaDestinoId: data.cuentaDestinoId,
        glosa: data.glosa,
      },
    });
  }

  async eliminar(tenantId: string, cobroId: string, tx: Prisma.TransactionClient): Promise<void> {
    // `delete` (no deleteMany): el cobro ajeno o inexistente lanza P2025 exacto
    // en vez de terminar en silencio (§4.2 — mismo criterio que `actualizar`).
    await tx.cobro.delete({ where: { id: cobroId, organizationId: tenantId } });
  }

  async findById(
    tenantId: string,
    id: string,
    tx?: Prisma.TransactionClient,
  ): Promise<Cobro | null> {
    const client = tx ?? this.prisma;
    return client.cobro.findFirst({ where: { id, organizationId: tenantId } });
  }

  async listar(
    tenantId: string,
    filtros: CobroListarFiltros,
    pagination: CobroListarPagination,
    tx?: Prisma.TransactionClient,
  ): Promise<{ cobros: Cobro[]; total: number }> {
    const client = tx ?? this.prisma;
    const where: Prisma.CobroWhereInput = {
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
    const [cobros, total] = await Promise.all([
      client.cobro.findMany({
        where,
        orderBy: [{ fechaContable: 'desc' }, { createdAt: 'desc' }],
        skip,
        take: pagination.limit,
      }),
      client.cobro.count({ where }),
    ]);
    return { cobros, total };
  }

  async obtenerComprobantesDeCobros(
    tenantId: string,
    cobroIds: string[],
    tx?: Prisma.TransactionClient,
  ): Promise<Map<string, ComprobanteDeCobro>> {
    if (cobroIds.length === 0) return new Map();
    const client = tx ?? this.prisma;
    // Lectura-proyección de la tabla de comprobantes (§3.7): el vínculo es el
    // @@unique (organizationId, origenTipo, origenId) — no hay FK a propósito.
    const comprobantes = await client.comprobante.findMany({
      where: {
        organizationId: tenantId,
        origenTipo: ORIGEN_TIPO_COBRO,
        origenId: { in: cobroIds },
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

  async obtenerComprobantesDeVentas(
    tenantId: string,
    ventaIds: string[],
    tx?: Prisma.TransactionClient,
  ): Promise<Map<string, ComprobanteDeCobro>> {
    if (ventaIds.length === 0) return new Map();
    const client = tx ?? this.prisma;
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
        c.origenId ?? '',
        { id: c.id, numero: c.numero, estado: c.estado, anulado: c.anulado },
      ]),
    );
  }

  async listarAplicacionesDeCobro(
    tenantId: string,
    cobroId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<AplicacionDeCobro[]> {
    const client = tx ?? this.prisma;
    return client.aplicacionCobro.findMany({
      where: { organizationId: tenantId, cobroId },
      select: { id: true, ventaId: true, montoAplicado: true, createdAt: true },
      // La más reciente primero; `id` desempata createdAt iguales para que la
      // desvinculación masiva sea determinista (mismo criterio que ventas).
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
  }

  async crearAplicacion(
    tenantId: string,
    data: AplicacionCreateData,
    tx: Prisma.TransactionClient,
  ): Promise<AplicacionCobroRow | null> {
    // REQ-CXC-08, defense in depth: el vínculo re-verifica AMBAS puntas contra
    // el tenant aunque el service ya lo haya hecho — el agujero clásico es
    // aplicar un cobro del tenant A a una venta del tenant B. Punta ajena →
    // null, nada escrito (el service traduce a 404). Lecturas secuenciales a
    // propósito: dentro de una TX interactiva de Prisma no se paraleliza.
    const cobro = await tx.cobro.findFirst({
      where: { id: data.cobroId, organizationId: tenantId },
      select: { id: true },
    });
    if (!cobro) return null;

    const venta = await tx.venta.findFirst({
      where: { id: data.ventaId, organizationId: tenantId },
      select: { id: true },
    });
    if (!venta) return null;

    return tx.aplicacionCobro.create({
      data: {
        organizationId: tenantId,
        cobroId: data.cobroId,
        ventaId: data.ventaId,
        montoAplicado: data.montoAplicado,
        createdByUserId: data.createdByUserId,
      },
    });
  }

  async actualizarMontoAplicacion(
    tenantId: string,
    aplicacionId: string,
    montoAplicado: Prisma.Decimal,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    // `update` (no updateMany): la aplicación ajena o inexistente lanza P2025
    // exacto en vez de terminar en silencio (§4.2, lección Fase 4).
    await tx.aplicacionCobro.update({
      where: { id: aplicacionId, organizationId: tenantId },
      data: { montoAplicado },
    });
  }

  async eliminarAplicaciones(
    tenantId: string,
    aplicacionIds: string[],
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    if (aplicacionIds.length === 0) return;
    // deleteMany scopeado: los ids vienen de `listarAplicacionesDeCobro` del
    // MISMO tenant en la MISMA TX, así que un id ajeno simplemente no borra.
    await tx.aplicacionCobro.deleteMany({
      where: { organizationId: tenantId, id: { in: aplicacionIds } },
    });
  }

  async registrarAplicacionesDesvinculadas(
    tenantId: string,
    aplicaciones: AplicacionDesvinculadaData[],
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    if (aplicaciones.length === 0) return;
    await tx.aplicacionCobroDesvinculada.createMany({
      data: aplicaciones.map((a) => ({
        organizationId: tenantId,
        cobroId: a.cobroId,
        ventaId: a.ventaId,
        montoAplicado: a.montoAplicado,
        motivo: a.motivo,
        userId: a.userId,
      })),
    });
  }

  async obtenerSumasAplicadasConLock(
    tenantId: string,
    params: SumasAplicadasParams,
    tx: Prisma.TransactionClient,
  ): Promise<SumasAplicadasConLock | null> {
    // ORDEN DE LOCKS DETERMINÍSTICO: SIEMPRE el cobro primero, la venta
    // después. Dos TX que tomaran (cobro, venta) en orden distinto podrían
    // deadlockearse (A espera la venta que B tiene, B espera el cobro que A
    // tiene). Con un orden global por TIPO de recurso no puede formarse el
    // ciclo: nadie que tenga un lock de venta espera después uno de cobro.
    // `obtenerCobroConAplicadoConLock` respeta el mismo orden (solo cobro).
    //
    // Prisma no expone FOR UPDATE en el query builder; raw parametrizado
    // (mismo patrón que `granja/adapters/prisma-lote.repository.ts`).
    const cobros = await tx.$queryRaw<
      Array<{ id: string; contactoId: string; monto: Prisma.Decimal }>
    >`
      SELECT id, "contactoId", monto
      FROM cobros
      WHERE id = ${params.cobroId} AND "organizationId" = ${tenantId}
      FOR UPDATE
    `;
    const cobro = cobros[0];
    if (!cobro) return null;

    const ventas = await tx.$queryRaw<
      Array<{
        id: string;
        contactoId: string;
        montoTotal: Prisma.Decimal;
        condicionPago: CondicionPago;
      }>
    >`
      SELECT id, "contactoId", "montoTotal", "condicionPago"
      FROM ventas
      WHERE id = ${params.ventaId} AND "organizationId" = ${tenantId}
      FOR UPDATE
    `;
    const venta = ventas[0];
    if (!venta) return null;

    // SUM() EN SQL, después de tener AMBOS locks (Anti-11): ninguna otra TX
    // puede escribir aplicaciones de este cobro o esta venta hasta el commit,
    // porque toda escritura pasa antes por estos mismos locks.
    const filtroExcluir =
      params.excluirAplicacionId !== undefined
        ? Prisma.sql`AND id <> ${params.excluirAplicacionId}`
        : Prisma.empty;
    const sumas = await tx.$queryRaw<
      Array<{ aplicadoAlCobro: Prisma.Decimal; aplicadoALaVenta: Prisma.Decimal }>
    >`
      SELECT
        COALESCE(SUM("montoAplicado") FILTER (WHERE "cobroId" = ${params.cobroId}), 0) AS "aplicadoAlCobro",
        COALESCE(SUM("montoAplicado") FILTER (WHERE "ventaId" = ${params.ventaId}), 0) AS "aplicadoALaVenta"
      FROM aplicaciones_cobro
      WHERE "organizationId" = ${tenantId}
        AND ("cobroId" = ${params.cobroId} OR "ventaId" = ${params.ventaId})
        ${filtroExcluir}
    `;
    const fila = sumas[0];

    return {
      cobro: { id: cobro.id, contactoId: cobro.contactoId, monto: cobro.monto },
      venta: {
        id: venta.id,
        contactoId: venta.contactoId,
        montoTotal: venta.montoTotal,
        condicionPago: venta.condicionPago,
      },
      aplicadoAlCobro: fila?.aplicadoAlCobro ?? new Prisma.Decimal(0),
      aplicadoALaVenta: fila?.aplicadoALaVenta ?? new Prisma.Decimal(0),
    };
  }

  async obtenerCobroConAplicadoConLock(
    tenantId: string,
    cobroId: string,
    tx: Prisma.TransactionClient,
  ): Promise<CobroConAplicadoConLock | null> {
    // Mismo lock (y mismo PRIMER lugar en el orden global) que
    // `obtenerSumasAplicadasConLock`: el guard de bajar el monto y las
    // escrituras de aplicaciones concurrentes se serializan sobre esta fila.
    const cobros = await tx.$queryRaw<
      Array<{ id: string; contactoId: string; monto: Prisma.Decimal }>
    >`
      SELECT id, "contactoId", monto
      FROM cobros
      WHERE id = ${cobroId} AND "organizationId" = ${tenantId}
      FOR UPDATE
    `;
    const cobro = cobros[0];
    if (!cobro) return null;

    const sumas = await tx.$queryRaw<Array<{ aplicadoAlCobro: Prisma.Decimal }>>`
      SELECT COALESCE(SUM("montoAplicado"), 0) AS "aplicadoAlCobro"
      FROM aplicaciones_cobro
      WHERE "organizationId" = ${tenantId} AND "cobroId" = ${cobroId}
    `;

    return {
      id: cobro.id,
      contactoId: cobro.contactoId,
      monto: cobro.monto,
      aplicadoAlCobro: sumas[0]?.aplicadoAlCobro ?? new Prisma.Decimal(0),
    };
  }
}
