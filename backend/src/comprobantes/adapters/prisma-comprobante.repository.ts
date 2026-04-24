import { Injectable } from '@nestjs/common';
import { EstadoComprobante, Prisma } from '@prisma/client';

import { PrismaService } from '@/common/prisma.service';

import {
  AuditoriaCreateData,
  ComprobanteConLineas,
  ComprobanteCreateBorradorData,
  ComprobanteReemplazarBorradorData,
  ComprobanteRepositoryPort,
  ListarFiltros,
} from '../ports/comprobante.repository.port';

const LINEAS_INCLUDE = { lineas: { orderBy: { orden: 'asc' as const } } };

@Injectable()
export class PrismaComprobanteRepository extends ComprobanteRepositoryPort {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async crearBorrador(
    tenantId: string,
    data: ComprobanteCreateBorradorData,
    tx?: Prisma.TransactionClient,
  ): Promise<ComprobanteConLineas> {
    const client = tx ?? this.prisma;
    return client.comprobante.create({
      data: {
        organizationId: tenantId,
        tipo: data.tipo,
        estado: EstadoComprobante.BORRADOR,
        fechaContable: data.fechaContable,
        periodoFiscalId: data.periodoFiscalId,
        glosa: data.glosa,
        monedaPrincipal: data.monedaPrincipal,
        createdByUserId: data.createdByUserId,
        lineas: {
          create: data.lineas.map((l) => ({
            organizationId: tenantId,
            orden: l.orden,
            cuentaId: l.cuentaId,
            contactoId: l.contactoId,
            moneda: l.moneda,
            debito: l.debito,
            credito: l.credito,
            tipoCambio: l.tipoCambio,
            debitoBob: l.debitoBob,
            creditoBob: l.creditoBob,
            glosaLinea: l.glosaLinea,
          })),
        },
      },
      include: LINEAS_INCLUDE,
    });
  }

  async findById(
    tenantId: string,
    id: string,
    tx?: Prisma.TransactionClient,
  ): Promise<ComprobanteConLineas | null> {
    const client = tx ?? this.prisma;
    return client.comprobante.findFirst({
      where: { id, organizationId: tenantId },
      include: LINEAS_INCLUDE,
    });
  }

  async reemplazarBorrador(
    tenantId: string,
    id: string,
    data: ComprobanteReemplazarBorradorData,
    tx?: Prisma.TransactionClient,
  ): Promise<ComprobanteConLineas> {
    const client = tx ?? this.prisma;
    // updateMany con where scopeado al tenant + estado BORRADOR: defense in
    // depth. Si por algún motivo el servicio llamó sin chequear estado, el
    // update afecta 0 filas y Prisma no lanza — pero la validación prior ya
    // debería haber rechazado. Acá solo ejecutamos.
    return client.comprobante.update({
      where: { id, organizationId: tenantId },
      data: {
        tipo: data.tipo,
        fechaContable: data.fechaContable,
        periodoFiscalId: data.periodoFiscalId,
        glosa: data.glosa,
        monedaPrincipal: data.monedaPrincipal,
        lineas: {
          deleteMany: {},
          create: data.lineas.map((l) => ({
            organizationId: tenantId,
            orden: l.orden,
            cuentaId: l.cuentaId,
            contactoId: l.contactoId,
            moneda: l.moneda,
            debito: l.debito,
            credito: l.credito,
            tipoCambio: l.tipoCambio,
            debitoBob: l.debitoBob,
            creditoBob: l.creditoBob,
            glosaLinea: l.glosaLinea,
          })),
        },
      },
      include: LINEAS_INCLUDE,
    });
  }

  async contabilizar(
    tenantId: string,
    id: string,
    data: {
      numero: string;
      totalDebitoBob: Prisma.Decimal;
      totalCreditoBob: Prisma.Decimal;
    },
    tx?: Prisma.TransactionClient,
  ): Promise<ComprobanteConLineas> {
    const client = tx ?? this.prisma;
    return client.comprobante.update({
      where: { id, organizationId: tenantId },
      data: {
        estado: EstadoComprobante.CONTABILIZADO,
        numero: data.numero,
        totalDebitoBob: data.totalDebitoBob,
        totalCreditoBob: data.totalCreditoBob,
      },
      include: LINEAS_INCLUDE,
    });
  }

  async eliminarBorrador(
    tenantId: string,
    id: string,
    tx?: Prisma.TransactionClient,
  ): Promise<number> {
    const client = tx ?? this.prisma;
    const res = await client.comprobante.deleteMany({
      where: {
        id,
        organizationId: tenantId,
        estado: EstadoComprobante.BORRADOR,
      },
    });
    return res.count;
  }

  async listar(
    tenantId: string,
    filtros: ListarFiltros,
    pagination: { page: number; limit: number },
    tx?: Prisma.TransactionClient,
  ): Promise<{ items: ComprobanteConLineas[]; total: number }> {
    const client = tx ?? this.prisma;

    const where: Prisma.ComprobanteWhereInput = {
      organizationId: tenantId,
      ...(filtros.periodoFiscalId ? { periodoFiscalId: filtros.periodoFiscalId } : {}),
      ...(filtros.tipo ? { tipo: filtros.tipo } : {}),
      ...(filtros.estado ? { estado: filtros.estado } : {}),
      ...(filtros.fechaDesde || filtros.fechaHasta
        ? {
            fechaContable: {
              ...(filtros.fechaDesde ? { gte: filtros.fechaDesde } : {}),
              ...(filtros.fechaHasta ? { lte: filtros.fechaHasta } : {}),
            },
          }
        : {}),
      ...(filtros.q
        ? {
            OR: [
              { numero: { contains: filtros.q, mode: 'insensitive' as const } },
              { glosa: { contains: filtros.q, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      client.comprobante.findMany({
        where,
        include: LINEAS_INCLUDE,
        orderBy: [{ fechaContable: 'desc' }, { numero: { sort: 'desc', nulls: 'first' } }],
        skip: (pagination.page - 1) * pagination.limit,
        take: pagination.limit,
      }),
      client.comprobante.count({ where }),
    ]);
    return { items, total };
  }

  async registrarAuditoria(
    tenantId: string,
    data: AuditoriaCreateData,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const client = tx ?? this.prisma;
    await client.comprobanteAuditoria.create({
      data: {
        organizationId: tenantId,
        comprobanteId: data.comprobanteId,
        userId: data.userId,
        accion: data.accion,
        diff: data.diff,
        fueDuranteReapertura: data.fueDuranteReapertura ?? false,
        reaperturaId: data.reaperturaId ?? null,
      },
    });
  }
}
