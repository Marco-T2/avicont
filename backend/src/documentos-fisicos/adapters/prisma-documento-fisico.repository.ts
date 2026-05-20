import { Injectable } from '@nestjs/common';
import type { DocumentoFisico } from '@prisma/client';
import { Prisma } from '@prisma/client';

import { PrismaService } from '@/common/prisma.service';

import { DocumentoFisicoNumeroDuplicadoError } from '../domain/documento-fisico-errors';
import {
  DocumentoFisicoCreateData,
  DocumentoFisicoListarFiltros,
  DocumentoFisicoListarPagination,
  DocumentoFisicoRepositoryPort,
  DocumentoFisicoUpdateData,
} from '../ports/documento-fisico.repository.port';

// Nombre estable del UNIQUE en BD (defense in depth — CLAUDE.md §4.8).
// El adapter mapea P2002 con este target al DomainError correcto.
const UNIQUE_NUMERO_INDEX = 'documentos_fisicos_organizationId_tipoDocumentoFisicoId_numero_key';

@Injectable()
export class PrismaDocumentoFisicoRepository extends DocumentoFisicoRepositoryPort {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async create(
    tenantId: string,
    data: DocumentoFisicoCreateData,
    tx?: Prisma.TransactionClient,
  ): Promise<DocumentoFisico> {
    const client = tx ?? this.prisma;
    try {
      return await client.documentoFisico.create({
        data: {
          organizationId: tenantId,
          tipoDocumentoFisicoId: data.tipoDocumentoFisicoId,
          // Número ya normalizado por el service (trim + uppercase).
          numero: data.numero,
          fechaEmision: data.fechaEmision,
          ...(data.monto !== null && data.monto !== undefined ? { monto: data.monto } : {}),
          ...(data.moneda !== null && data.moneda !== undefined ? { moneda: data.moneda } : {}),
          ...(data.glosa !== null && data.glosa !== undefined ? { glosa: data.glosa } : {}),
          ...(data.contactoId !== null && data.contactoId !== undefined
            ? { contactoId: data.contactoId }
            : {}),
          createdByUserId: data.createdByUserId,
        },
      });
    } catch (err) {
      this.mapP2002(err, data.numero, data.tipoDocumentoFisicoId);
      throw err;
    }
  }

  async findById(
    tenantId: string,
    id: string,
    tx?: Prisma.TransactionClient,
  ): Promise<DocumentoFisico | null> {
    const client = tx ?? this.prisma;
    return client.documentoFisico.findFirst({
      where: { id, organizationId: tenantId },
    });
  }

  async findByNumero(
    tenantId: string,
    tipoDocumentoFisicoId: string,
    numero: string,
    tx?: Prisma.TransactionClient,
  ): Promise<DocumentoFisico | null> {
    const client = tx ?? this.prisma;
    return client.documentoFisico.findFirst({
      where: { organizationId: tenantId, tipoDocumentoFisicoId, numero },
    });
  }

  async listar(
    tenantId: string,
    filtros: DocumentoFisicoListarFiltros,
    pagination: DocumentoFisicoListarPagination,
    tx?: Prisma.TransactionClient,
  ): Promise<{ items: DocumentoFisico[]; total: number }> {
    const client = tx ?? this.prisma;

    const where: Prisma.DocumentoFisicoWhereInput = {
      organizationId: tenantId,
      ...(filtros.tipoDocumentoFisicoId !== undefined
        ? { tipoDocumentoFisicoId: filtros.tipoDocumentoFisicoId }
        : {}),
      ...(filtros.fechaDesde !== undefined || filtros.fechaHasta !== undefined
        ? {
            fechaEmision: {
              ...(filtros.fechaDesde !== undefined ? { gte: filtros.fechaDesde } : {}),
              ...(filtros.fechaHasta !== undefined ? { lte: filtros.fechaHasta } : {}),
            },
          }
        : {}),
      ...(filtros.contactoId !== undefined ? { contactoId: filtros.contactoId } : {}),
      ...(filtros.q !== undefined && filtros.q.trim().length > 0
        ? { numero: { contains: filtros.q.trim(), mode: 'insensitive' as const } }
        : {}),
      // Filtro por estado derivado vía sub-query sobre la tabla de asociaciones.
      // R5: revisar explain en tablas grandes; candidato a materializar.
      ...(filtros.estado !== undefined ? this.buildEstadoFilter(filtros.estado) : {}),
    };

    const orderBy: Prisma.DocumentoFisicoOrderByWithRelationInput = this.buildOrderBy(pagination);

    const skip = (pagination.page - 1) * pagination.limit;
    const [items, total] = await Promise.all([
      client.documentoFisico.findMany({
        where,
        orderBy,
        skip,
        take: pagination.limit,
      }),
      client.documentoFisico.count({ where }),
    ]);
    return { items, total };
  }

  async update(
    tenantId: string,
    id: string,
    data: DocumentoFisicoUpdateData,
    tx?: Prisma.TransactionClient,
  ): Promise<DocumentoFisico> {
    const client = tx ?? this.prisma;

    // exactOptionalPropertyTypes: spread condicional (CLAUDE.md §2.5.1).
    // Los campos nullables usan un spread que diferencia "ausente" de "null".
    const updateData: Prisma.DocumentoFisicoUpdateInput = {
      ...(data.tipoDocumentoFisicoId !== undefined
        ? { tipoDocumentoFisicoId: data.tipoDocumentoFisicoId }
        : {}),
      ...(data.numero !== undefined ? { numero: data.numero } : {}),
      ...(data.fechaEmision !== undefined ? { fechaEmision: data.fechaEmision } : {}),
      // monto y moneda pueden ser null (clear) o un valor concreto
      ...('monto' in data ? { monto: data.monto ?? null } : {}),
      ...('moneda' in data ? { moneda: data.moneda ?? null } : {}),
      ...('glosa' in data ? { glosa: data.glosa ?? null } : {}),
      ...('contactoId' in data ? { contactoId: data.contactoId ?? null } : {}),
    };

    return client.documentoFisico.update({
      where: { id, organizationId: tenantId },
      data: updateData,
    });
  }

  async eliminar(tenantId: string, id: string, tx?: Prisma.TransactionClient): Promise<number> {
    const client = tx ?? this.prisma;
    const result = await client.documentoFisico.deleteMany({
      where: { id, organizationId: tenantId },
    });
    return result.count;
  }

  async countAsociaciones(
    tenantId: string,
    documentoFisicoId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<number> {
    const client = tx ?? this.prisma;
    return client.comprobanteDocumentoFisico.count({
      where: { documentoFisicoId, organizationId: tenantId },
    });
  }

  async countAsociacionesContabilizadas(
    tenantId: string,
    documentoFisicoId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<number> {
    const client = tx ?? this.prisma;
    return client.comprobanteDocumentoFisico.count({
      where: {
        documentoFisicoId,
        organizationId: tenantId,
        comprobanteEstado: 'CONTABILIZADO',
      },
    });
  }

  // ------------------------------------------------------------------
  // Helpers privados
  // ------------------------------------------------------------------

  /**
   * Construye el fragmento `where` para el filtro por estado derivado.
   * Implementado vía `asociaciones.some/none` sin JOIN explícito.
   */
  private buildEstadoFilter(
    estado: 'libre' | 'asociado' | 'contabilizado',
  ): Prisma.DocumentoFisicoWhereInput {
    switch (estado) {
      case 'libre':
        return { asociaciones: { none: {} } };
      case 'asociado':
        return { asociaciones: { some: {} } };
      case 'contabilizado':
        return {
          asociaciones: { some: { comprobanteEstado: 'CONTABILIZADO' } },
        };
    }
  }

  private buildOrderBy(
    pagination: DocumentoFisicoListarPagination,
  ): Prisma.DocumentoFisicoOrderByWithRelationInput {
    const field = pagination.orderBy ?? 'fechaEmision';
    const dir = pagination.orderDir ?? 'desc';
    return { [field]: dir };
  }

  /**
   * Si el error es un P2002 con el target del índice de unicidad de
   * número, lanza `DocumentoFisicoNumeroDuplicadoError`. En otro caso
   * no hace nada (el caller debe re-lanzar el error original).
   * NOTA: no retorna `never` para poder usarse en la cláusula catch
   * sin suprimir el throw original.
   */
  private mapP2002(err: unknown, numero: string, tipoDocumentoFisicoId: string): void {
    if (!(err instanceof Prisma.PrismaClientKnownRequestError) || err.code !== 'P2002') return;

    const target = err.meta?.['target'];
    const targetStr = Array.isArray(target)
      ? target.join(',')
      : typeof target === 'string'
        ? target
        : '';

    if (targetStr.includes(UNIQUE_NUMERO_INDEX) || targetStr.includes('numero')) {
      throw new DocumentoFisicoNumeroDuplicadoError(numero, tipoDocumentoFisicoId);
    }
  }
}
