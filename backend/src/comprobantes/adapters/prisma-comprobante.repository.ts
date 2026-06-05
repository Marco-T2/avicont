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
  ComprobanteListRow,
  ComprobanteReemplazarComprobanteData,
  ComprobanteRepositoryPort,
  ListarFiltros,
} from '../ports/comprobante.repository.port';

const LINEAS_INCLUDE = { lineas: { orderBy: { orden: 'asc' as const } } };

// Proyección liviana del listado: solo el contacto de cada línea (para derivar
// contactos distintos) y los documentos físicos de respaldo. No trae las líneas
// completas — la tabla no las usa.
const LIST_INCLUDE = {
  lineas: {
    select: { contacto: { select: { id: true, razonSocial: true } } },
    orderBy: { orden: 'asc' as const },
  },
  documentosFisicosAsociados: {
    select: {
      documentoFisico: {
        select: {
          id: true,
          numero: true,
          tipoDocumento: { select: { nombre: true } },
        },
      },
    },
  },
} satisfies Prisma.ComprobanteInclude;

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
        // exactOptionalPropertyTypes (§2.5.1): spread condicional para no pasar undefined.
        ...(data.tipoCambioReexpresion !== undefined
          ? { tipoCambioReexpresion: data.tipoCambioReexpresion }
          : {}),
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
        // exactOptionalPropertyTypes (§2.5.1): spread condicional para no pasar undefined.
        ...(data.tipoCambioReexpresion !== undefined
          ? { tipoCambioReexpresion: data.tipoCambioReexpresion }
          : {}),
        ...(data.totalDebitoBob !== undefined ? { totalDebitoBob: data.totalDebitoBob } : {}),
        ...(data.totalCreditoBob !== undefined ? { totalCreditoBob: data.totalCreditoBob } : {}),
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

  /**
   * Helper privado que construye el WHERE compartido entre listar, listarParaExport
   * y contarParaExport. Centraliza el Anti-31 (organizationId: tenantId siempre) y
   * toda la lógica de filtros para evitar drift de seguridad entre los tres métodos.
   */
  private construirWhereListado(
    tenantId: string,
    filtros: ListarFiltros,
  ): Prisma.ComprobanteWhereInput {
    return {
      organizationId: tenantId, // Anti-31 — SIEMPRE
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
  }

  async listar(
    tenantId: string,
    filtros: ListarFiltros,
    pagination: { page: number; limit: number },
    tx?: Prisma.TransactionClient,
  ): Promise<{ items: ComprobanteListRow[]; total: number }> {
    const client = tx ?? this.prisma;
    const where = this.construirWhereListado(tenantId, filtros);

    const [items, total] = await Promise.all([
      client.comprobante.findMany({
        where,
        include: LIST_INCLUDE,
        orderBy: [{ fechaContable: 'desc' }, { numero: { sort: 'desc', nulls: 'first' } }],
        skip: (pagination.page - 1) * pagination.limit,
        take: pagination.limit,
      }),
      client.comprobante.count({ where }),
    ]);
    return { items, total };
  }

  async contarParaExport(
    tenantId: string,
    filtros: ListarFiltros,
    tx?: Prisma.TransactionClient,
  ): Promise<number> {
    const client = tx ?? this.prisma;
    return client.comprobante.count({ where: this.construirWhereListado(tenantId, filtros) });
  }

  async listarParaExport(
    tenantId: string,
    filtros: ListarFiltros,
    tx?: Prisma.TransactionClient,
  ): Promise<ComprobanteListRow[]> {
    const client = tx ?? this.prisma;
    return client.comprobante.findMany({
      where: this.construirWhereListado(tenantId, filtros),
      include: LIST_INCLUDE,
      // Orden ASCENDENTE para export de auditoría — OPUESTO al listado paginado (DESC).
      // Borradores (numero NULL) al final dentro de la misma fecha (NULLS LAST).
      orderBy: [{ fechaContable: 'asc' }, { numero: { sort: 'asc', nulls: 'last' } }],
      // SIN skip/take — trae todo el rango
    });
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
