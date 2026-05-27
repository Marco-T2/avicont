import { Injectable } from '@nestjs/common';
import { EstadoComprobante, Prisma } from '@prisma/client';

import { PrismaService } from '@/common/prisma.service';

import {
  AnulacionMetadata,
  AuditoriaCreateData,
  ComprobanteConLineas,
  ComprobanteCreateBorradorData,
  ComprobanteReemplazarBorradorData,
  ComprobanteRepositoryPort,
  ListarFiltros,
  ReversionCreateData,
} from '../ports/comprobante.repository.port';
import type { ComprobantesAuditRow } from '../dto/auditoria-response.dto';

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

  async crearReversion(
    tenantId: string,
    data: ReversionCreateData,
    tx?: Prisma.TransactionClient,
  ): Promise<ComprobanteConLineas> {
    // TODO sdd:comprobantes-anulacion-refactor task 6.x — eliminar crearReversion del port.
    // El modelo de reversión fue reemplazado por flag anulado=true (§4.7 CLAUDE.md).
    // Este método nunca debería llamarse en producción con el nuevo flujo; queda como
    // stub para no romper el tipo del port hasta el cleanup en task 6.x.
    const client = tx ?? this.prisma;
    return client.comprobante.create({
      data: {
        organizationId: tenantId,
        tipo: data.tipo,
        numero: data.numero,
        estado: EstadoComprobante.CONTABILIZADO,
        fechaContable: data.fechaContable,
        periodoFiscalId: data.periodoFiscalId,
        glosa: data.glosa,
        monedaPrincipal: data.monedaPrincipal,
        totalDebitoBob: data.totalDebitoBob,
        totalCreditoBob: data.totalCreditoBob,
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

  async marcarAnulado(
    tenantId: string,
    id: string,
    metadata: AnulacionMetadata,
    tx?: Prisma.TransactionClient,
  ): Promise<ComprobanteConLineas> {
    // TODO sdd:comprobantes-anulacion-refactor task 6.2 — replace with anular() that sets
    // anulado=true flag. marcarAnulado will be removed from port and adapter.
    const client = tx ?? this.prisma;
    return client.comprobante.update({
      where: { id, organizationId: tenantId },
      data: {
        anulado: true,
        fechaAnulacion: metadata.anuladoEn,
        anuladoPorUserId: metadata.anuladoPorUserId,
        motivoAnulacion: metadata.motivoAnulacion,
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

  async registrarAuditoria(
    _tenantId: string,
    _data: AuditoriaCreateData,
    _tx?: Prisma.TransactionClient,
  ): Promise<void> {
    // TODO sdd:comprobantes-anulacion-refactor task 6.x — eliminar este método del port.
    // La auditoría la captura el trigger trg_comprobantes_audit en la tabla raw
    // comprobantes_audit. Ya no hay tabla comprobanteAuditoria en Prisma.
    // El servicio todavía llama a registrarAuditoria en algunos flujos (task 5.5 los eliminará).
  }

  async listarAuditoria(
    tenantId: string,
    comprobanteId: string,
    _tx?: Prisma.TransactionClient,
  ): Promise<ComprobantesAuditRow[]> {
    // TODO sdd:comprobantes-anulacion-refactor task 7.x — reescribir con prisma.$queryRaw
    // sobre la tabla comprobantes_audit. Por ahora devuelve vacío.
    void tenantId;
    void comprobanteId;
    return [];
  }
}
