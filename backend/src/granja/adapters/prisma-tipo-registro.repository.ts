import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import { PrismaService } from '@/common/prisma.service';

import { NaturalezaRegistro } from '../domain/enums';
import {
  TipoRegistroCreateData,
  TipoRegistroRepositoryPort,
  TipoRegistroRow,
  TipoRegistroSeedRow,
  TipoRegistroUpdateData,
} from '../ports/tipo-registro.repository.port';

/**
 * Adapter Prisma del TipoRegistroRepositoryPort.
 *
 * CLAUDE.md §4.2 — defense in depth: TODA query filtra por organizationId.
 */
@Injectable()
export class PrismaTipoRegistroRepository extends TipoRegistroRepositoryPort {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async create(
    organizationId: string,
    data: TipoRegistroCreateData,
    tx?: Prisma.TransactionClient,
  ): Promise<TipoRegistroRow> {
    const client = tx ?? this.prisma;
    const row = await client.tipoRegistro.create({
      data: {
        organizationId,
        nombre: data.nombre,
        naturaleza: data.naturaleza,
        esSistema: data.esSistema,
      },
    });
    return this.toRow(row);
  }

  async findById(
    organizationId: string,
    id: string,
    tx?: Prisma.TransactionClient,
  ): Promise<TipoRegistroRow | null> {
    const client = tx ?? this.prisma;
    const row = await client.tipoRegistro.findFirst({
      where: { id, organizationId },
    });
    return row ? this.toRow(row) : null;
  }

  async findByNombre(
    organizationId: string,
    nombre: string,
    tx?: Prisma.TransactionClient,
  ): Promise<TipoRegistroRow | null> {
    const client = tx ?? this.prisma;
    const row = await client.tipoRegistro.findFirst({
      where: { organizationId, nombre },
    });
    return row ? this.toRow(row) : null;
  }

  async listar(
    organizationId: string,
    filtros: { activo?: boolean | 'all'; naturaleza?: NaturalezaRegistro },
    tx?: Prisma.TransactionClient,
  ): Promise<TipoRegistroRow[]> {
    const client = tx ?? this.prisma;

    const activoFilter: boolean | undefined =
      filtros.activo === 'all' ? undefined : (filtros.activo ?? true);

    const where: Prisma.TipoRegistroWhereInput = {
      organizationId,
      ...(activoFilter !== undefined ? { activo: activoFilter } : {}),
      ...(filtros.naturaleza !== undefined ? { naturaleza: filtros.naturaleza } : {}),
    };

    // Orden: tipos de sistema primero (esSistema DESC), luego nombre ASC
    const rows = await client.tipoRegistro.findMany({
      where,
      orderBy: [{ esSistema: 'desc' }, { nombre: 'asc' }],
    });

    return rows.map((r) => this.toRow(r));
  }

  async update(
    organizationId: string,
    id: string,
    data: TipoRegistroUpdateData,
    tx?: Prisma.TransactionClient,
  ): Promise<TipoRegistroRow> {
    const client = tx ?? this.prisma;
    // exactOptionalPropertyTypes: spread condicional (CLAUDE.md §2.5.1).
    // naturaleza NO está en TipoRegistroUpdateData — es inmutable post-creación.
    const updateData: Prisma.TipoRegistroUpdateInput = {
      ...(data.nombre !== undefined ? { nombre: data.nombre } : {}),
      ...(data.activo !== undefined ? { activo: data.activo } : {}),
    };
    const row = await client.tipoRegistro.update({
      where: { id, organizationId },
      data: updateData,
    });
    return this.toRow(row);
  }

  async setActivo(
    organizationId: string,
    id: string,
    activo: boolean,
    tx?: Prisma.TransactionClient,
  ): Promise<TipoRegistroRow> {
    const client = tx ?? this.prisma;
    const row = await client.tipoRegistro.update({
      where: { id, organizationId },
      data: { activo },
    });
    return this.toRow(row);
  }

  async countMovimientos(
    organizationId: string,
    tipoRegistroId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<number> {
    const client = tx ?? this.prisma;
    const [inversionCount, cantidadCount] = await Promise.all([
      client.movimientoInversion.count({
        where: { organizationId, tipoRegistroId },
      }),
      client.movimientoCantidad.count({
        where: { organizationId, tipoRegistroId },
      }),
    ]);
    return inversionCount + cantidadCount;
  }

  async eliminar(
    organizationId: string,
    id: string,
    tx?: Prisma.TransactionClient,
  ): Promise<number> {
    const client = tx ?? this.prisma;
    const result = await client.tipoRegistro.deleteMany({
      where: { id, organizationId },
    });
    return result.count;
  }

  /**
   * Upsert idempotente por (organizationId, nombre).
   * Re-correr el seed es no-op (update: {} no toca nada importante).
   * Cicatriz F-01: el UNIQUE de BD es la última línea de defensa.
   */
  async upsertSeed(
    organizationId: string,
    seeds: TipoRegistroSeedRow[],
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const client = tx ?? this.prisma;
    for (const seed of seeds) {
      await client.tipoRegistro.upsert({
        where: {
          organizationId_nombre: { organizationId, nombre: seed.nombre },
        },
        create: {
          organizationId,
          nombre: seed.nombre,
          naturaleza: seed.naturaleza,
          esSistema: seed.esSistema,
        },
        update: {},
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Mapeo Prisma row → TipoRegistroRow
  // ---------------------------------------------------------------------------

  private toRow(row: {
    id: string;
    organizationId: string;
    nombre: string;
    naturaleza: string;
    esSistema: boolean;
    activo: boolean;
    createdAt: Date;
    updatedAt: Date;
  }): TipoRegistroRow {
    return {
      id: row.id,
      organizationId: row.organizationId,
      nombre: row.nombre,
      naturaleza: row.naturaleza as NaturalezaRegistro,
      esSistema: row.esSistema,
      activo: row.activo,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
