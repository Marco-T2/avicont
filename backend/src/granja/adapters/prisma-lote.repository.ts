import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import { PrismaService } from '@/common/prisma.service';

import { EstadoLote } from '../domain/enums';
import {
  LoteCreateData,
  LoteRepositoryPort,
  LoteRow,
  LoteUpdateData,
} from '../ports/lote.repository.port';

/**
 * Adapter Prisma del LoteRepositoryPort.
 *
 * CLAUDE.md §4.2 — defense in depth: TODA query filtra por organizationId.
 * Una query sin este filtro es bug de seguridad.
 */
@Injectable()
export class PrismaLoteRepository extends LoteRepositoryPort {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async create(
    organizationId: string,
    data: LoteCreateData,
    tx?: Prisma.TransactionClient,
  ): Promise<LoteRow> {
    const client = tx ?? this.prisma;
    const row = await client.lote.create({
      data: {
        organizationId,
        cantidadInicial: data.cantidadInicial,
        fechaIngreso: data.fechaIngreso,
        galpon: data.galpon ?? null,
        ...(data.fechaEstimadaSaca !== undefined
          ? { fechaEstimadaSaca: data.fechaEstimadaSaca }
          : {}),
        estado: EstadoLote.ACTIVO,
      },
    });
    return this.toRow(row);
  }

  async findById(
    organizationId: string,
    id: string,
    tx?: Prisma.TransactionClient,
  ): Promise<LoteRow | null> {
    const client = tx ?? this.prisma;
    const row = await client.lote.findFirst({
      where: { id, organizationId },
    });
    return row ? this.toRow(row) : null;
  }

  /**
   * SELECT ... FOR UPDATE — lock pesimista del aggregate root.
   * Prisma no expone FOR UPDATE en el query builder; usamos raw parametrizado
   * (G-8: sin interpolación de strings).
   */
  async findByIdForUpdate(
    organizationId: string,
    id: string,
    tx: Prisma.TransactionClient,
  ): Promise<LoteRow | null> {
    const rows = await tx.$queryRaw<
      Array<{
        id: string;
        organizationId: string;
        cantidadInicial: number;
        fechaIngreso: Date;
        fechaEstimadaSaca: Date | null;
        fechaCierre: Date | null;
        galpon: string | null;
        estado: string;
        createdAt: Date;
        updatedAt: Date;
      }>
    >`
      SELECT id, "organizationId", "cantidadInicial", "fechaIngreso",
             "fechaEstimadaSaca", "fechaCierre", galpon, estado, "createdAt", "updatedAt"
      FROM lotes
      WHERE id = ${id}
        AND "organizationId" = ${organizationId}
      FOR UPDATE
    `;
    const row = rows[0];
    if (!row) return null;
    return {
      id: row.id,
      organizationId: row.organizationId,
      cantidadInicial: row.cantidadInicial,
      fechaIngreso: row.fechaIngreso,
      fechaEstimadaSaca: row.fechaEstimadaSaca,
      fechaCierre: row.fechaCierre,
      galpon: row.galpon,
      estado: row.estado as EstadoLote,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  async listar(
    organizationId: string,
    filtros: { estado?: EstadoLote },
    pagination: { page: number; limit: number },
    tx?: Prisma.TransactionClient,
  ): Promise<{ items: LoteRow[]; total: number }> {
    const client = tx ?? this.prisma;

    const where: Prisma.LoteWhereInput = {
      organizationId,
      ...(filtros.estado !== undefined ? { estado: filtros.estado } : {}),
    };

    const skip = (pagination.page - 1) * pagination.limit;
    const [rows, total] = await Promise.all([
      client.lote.findMany({
        where,
        orderBy: { fechaIngreso: 'desc' },
        skip,
        take: pagination.limit,
      }),
      client.lote.count({ where }),
    ]);

    return { items: rows.map((r) => this.toRow(r)), total };
  }

  async update(
    organizationId: string,
    id: string,
    data: LoteUpdateData,
    tx?: Prisma.TransactionClient,
  ): Promise<LoteRow> {
    const client = tx ?? this.prisma;
    // exactOptionalPropertyTypes: spread condicional (CLAUDE.md §2.5.1).
    // cantidadInicial NO está en LoteUpdateData — es inmutable.
    const updateData: Prisma.LoteUpdateInput = {
      ...(data.fechaEstimadaSaca !== undefined
        ? { fechaEstimadaSaca: data.fechaEstimadaSaca }
        : {}),
      ...(data.galpon !== undefined ? { galpon: data.galpon } : {}),
    };
    const row = await client.lote.update({
      where: { id, organizationId },
      data: updateData,
    });
    return this.toRow(row);
  }

  async cerrar(
    organizationId: string,
    id: string,
    fechaCierre: Date,
    tx?: Prisma.TransactionClient,
  ): Promise<LoteRow> {
    const client = tx ?? this.prisma;
    const row = await client.lote.update({
      where: { id, organizationId },
      data: { estado: EstadoLote.CERRADO, fechaCierre },
    });
    return this.toRow(row);
  }

  // ---------------------------------------------------------------------------
  // Mapeo Prisma row → LoteRow
  // ---------------------------------------------------------------------------

  private toRow(row: {
    id: string;
    organizationId: string;
    cantidadInicial: number;
    fechaIngreso: Date;
    fechaEstimadaSaca: Date | null;
    fechaCierre: Date | null;
    galpon: string | null;
    estado: string;
    createdAt: Date;
    updatedAt: Date;
  }): LoteRow {
    return {
      id: row.id,
      organizationId: row.organizationId,
      cantidadInicial: row.cantidadInicial,
      fechaIngreso: row.fechaIngreso,
      fechaEstimadaSaca: row.fechaEstimadaSaca,
      fechaCierre: row.fechaCierre,
      galpon: row.galpon,
      estado: row.estado as EstadoLote,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
