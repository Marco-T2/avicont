import { Injectable } from '@nestjs/common';
import { EstadoComprobante, Prisma } from '@prisma/client';

import { PrismaService } from '@/common/prisma.service';

import {
  type ComprobanteAuditEntry,
  type ComprobanteAuditRow,
  toComprobanteAuditEntry,
} from '../ports/comprobante-audit.types';
import {
  AnularData,
  ComprobanteConLineas,
  ComprobanteCreateBorradorData,
  ComprobanteReemplazarComprobanteData,
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

  /**
   * Reemplaza completamente los campos editables y las líneas del comprobante.
   * Sirve tanto para edición de borradores como para `editarContabilizado`:
   * el patrón deleteMany + create es el mismo; el caller validó el estado.
   */
  async reemplazarComprobante(
    tenantId: string,
    id: string,
    data: ComprobanteReemplazarComprobanteData,
    tx?: Prisma.TransactionClient,
  ): Promise<ComprobanteConLineas> {
    const client = tx ?? this.prisma;
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

  /**
   * UPDATE in-place del flag de anulación (§4.7 CLAUDE.md).
   * Setea anulado=true y los 3 metadatos: fechaAnulacion, motivoAnulacion,
   * anuladoPorUserId. El estado permanece CONTABILIZADO — el flag es
   * ortogonal al estado. El trigger trg_comprobantes_audit captura el
   * UPDATE y genera la entry de auditoría en comprobantes_audit.
   */
  async anular(
    tenantId: string,
    id: string,
    data: AnularData,
    tx?: Prisma.TransactionClient,
  ): Promise<ComprobanteConLineas> {
    const client = tx ?? this.prisma;
    return client.comprobante.update({
      where: { id, organizationId: tenantId },
      data: {
        anulado: true,
        fechaAnulacion: data.fechaAnulacion,
        motivoAnulacion: data.motivoAnulacion,
        anuladoPorUserId: data.anuladoPorUserId,
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
      // REQ-COMP-REPORTES-01: por default excluye anulados; toggle los incluye.
      ...(!filtros.incluirAnulados ? { anulado: false } : {}),
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

  /**
   * Lee el historial de auditoría de un comprobante desde la tabla raw
   * `comprobantes_audit` (populada exclusivamente por triggers Postgres).
   * Incluye entries de las tablas 'comprobantes' y 'lineas_comprobante',
   * filtra por organizationId (defense in depth), ordena por ts ASC, id ASC.
   * Mapea las columnas snake_case de Postgres → camelCase del dominio.
   */
  async listarAuditoria(
    tenantId: string,
    comprobanteId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<ComprobanteAuditEntry[]> {
    const client = tx ?? this.prisma;
    const rows = await client.$queryRaw<ComprobanteAuditRow[]>`
      SELECT id::text,
             tabla,
             operacion,
             comprobante_id::text,
             organization_id::text,
             usuario_id,
             motivo,
             durante_reapertura,
             reapertura_id::text,
             datos_antes,
             datos_despues,
             ts
      FROM comprobantes_audit
      WHERE organization_id = ${tenantId}::uuid
        AND comprobante_id = ${comprobanteId}::uuid
      ORDER BY ts ASC, id ASC
    `;
    return rows.map(toComprobanteAuditEntry);
  }
}
