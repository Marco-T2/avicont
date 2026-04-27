import { Injectable } from '@nestjs/common';
import type { TipoDocumentoFisico } from '@prisma/client';
import { Prisma } from '@prisma/client';

import { PrismaService } from '@/common/prisma.service';

import {
  TipoDocumentoFisicoCodigoDuplicadoError,
  TipoDocumentoFisicoConDocumentosError,
  TipoDocumentoFisicoNombreDuplicadoError,
} from '../domain/tipo-documento-fisico-errors';
import {
  TipoDocumentoFisicoCreateData,
  TipoDocumentoFisicoRepositoryPort,
  TipoDocumentoFisicoSeedRow,
  TipoDocumentoFisicoUpdateData,
} from '../ports/tipo-documento-fisico.repository.port';

@Injectable()
export class PrismaTipoDocumentoFisicoRepository extends TipoDocumentoFisicoRepositoryPort {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async create(
    tenantId: string,
    data: TipoDocumentoFisicoCreateData,
    tx?: Prisma.TransactionClient,
  ): Promise<TipoDocumentoFisico> {
    const client = tx ?? this.prisma;
    try {
      return await client.tipoDocumentoFisico.create({
        data: {
          organizationId: tenantId,
          nombre: data.nombre,
          codigo: data.codigo,
          esTributario: data.esTributario,
          tiposComprobanteAplicables: data.tiposComprobanteAplicables,
          createdByUserId: data.createdByUserId,
        },
      });
    } catch (err) {
      throw this.mapKnownError(err, { codigo: data.codigo, nombre: data.nombre });
    }
  }

  async findById(
    tenantId: string,
    id: string,
    tx?: Prisma.TransactionClient,
  ): Promise<TipoDocumentoFisico | null> {
    const client = tx ?? this.prisma;
    return client.tipoDocumentoFisico.findFirst({
      where: { id, organizationId: tenantId },
    });
  }

  async findByCodigo(
    tenantId: string,
    codigo: string,
    tx?: Prisma.TransactionClient,
  ): Promise<TipoDocumentoFisico | null> {
    const client = tx ?? this.prisma;
    return client.tipoDocumentoFisico.findFirst({
      where: { organizationId: tenantId, codigo },
    });
  }

  async listar(
    tenantId: string,
    filtros: { activo?: boolean | 'all'; q?: string },
    pagination: { page: number; limit: number },
    tx?: Prisma.TransactionClient,
  ): Promise<{ items: TipoDocumentoFisico[]; total: number }> {
    const client = tx ?? this.prisma;

    const activoFilter: boolean | undefined =
      filtros.activo === 'all' ? undefined : (filtros.activo ?? true);

    const where: Prisma.TipoDocumentoFisicoWhereInput = {
      organizationId: tenantId,
      ...(activoFilter !== undefined ? { activo: activoFilter } : {}),
      ...(filtros.q !== undefined && filtros.q.trim().length > 0
        ? { nombre: { contains: filtros.q, mode: 'insensitive' } }
        : {}),
    };

    // Orden por defecto: REQ-T-09 (esTributario primero, luego nombre).
    const orderBy: Prisma.TipoDocumentoFisicoOrderByWithRelationInput[] = [
      { esTributario: 'desc' },
      { nombre: 'asc' },
    ];

    const skip = (pagination.page - 1) * pagination.limit;
    const [items, total] = await Promise.all([
      client.tipoDocumentoFisico.findMany({
        where,
        orderBy,
        skip,
        take: pagination.limit,
      }),
      client.tipoDocumentoFisico.count({ where }),
    ]);
    return { items, total };
  }

  async update(
    tenantId: string,
    id: string,
    data: TipoDocumentoFisicoUpdateData,
    tx?: Prisma.TransactionClient,
  ): Promise<TipoDocumentoFisico> {
    const client = tx ?? this.prisma;
    // exactOptionalPropertyTypes: spread condicional (CLAUDE.md §2.5.1).
    const updateData: Prisma.TipoDocumentoFisicoUpdateInput = {
      ...(data.nombre !== undefined ? { nombre: data.nombre } : {}),
      ...(data.esTributario !== undefined ? { esTributario: data.esTributario } : {}),
      ...(data.tiposComprobanteAplicables !== undefined
        ? { tiposComprobanteAplicables: data.tiposComprobanteAplicables }
        : {}),
    };
    try {
      return await client.tipoDocumentoFisico.update({
        where: { id, organizationId: tenantId },
        data: updateData,
      });
    } catch (err) {
      throw this.mapKnownError(err, { codigo: undefined, nombre: data.nombre });
    }
  }

  async setActivo(
    tenantId: string,
    id: string,
    activo: boolean,
    tx?: Prisma.TransactionClient,
  ): Promise<TipoDocumentoFisico> {
    const client = tx ?? this.prisma;
    return client.tipoDocumentoFisico.update({
      where: { id, organizationId: tenantId },
      data: { activo },
    });
  }

  async countDocumentosFisicos(
    tenantId: string,
    tipoId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<number> {
    const client = tx ?? this.prisma;
    return client.documentoFisico.count({
      where: { organizationId: tenantId, tipoDocumentoFisicoId: tipoId },
    });
  }

  async eliminar(
    tenantId: string,
    id: string,
    tx?: Prisma.TransactionClient,
  ): Promise<number> {
    const client = tx ?? this.prisma;
    try {
      const result = await client.tipoDocumentoFisico.deleteMany({
        where: { id, organizationId: tenantId },
      });
      return result.count;
    } catch (err) {
      // FK Restrict desde documentos_fisicos.tipoDocumentoFisicoId →
      // race contra el pre-check del service (defense in depth).
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2003'
      ) {
        throw new TipoDocumentoFisicoConDocumentosError(id);
      }
      throw err;
    }
  }

  async upsertSeed(
    tenantId: string,
    seeds: TipoDocumentoFisicoSeedRow[],
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const client = tx ?? this.prisma;
    // Upsert secuencial por (organizationId, codigo). Idempotente —
    // re-correr el seed actualiza nombre/esTributario/tiposComprobanteAplicables
    // pero NO duplica filas. createdByUserId queda nullable para indicar
    // que fue el sistema quien creó la fila.
    for (const seed of seeds) {
      await client.tipoDocumentoFisico.upsert({
        where: {
          organizationId_codigo: {
            organizationId: tenantId,
            codigo: seed.codigo,
          },
        },
        create: {
          organizationId: tenantId,
          codigo: seed.codigo,
          nombre: seed.nombre,
          esTributario: seed.esTributario,
          tiposComprobanteAplicables: seed.tiposComprobanteAplicables,
          createdByUserId: null,
        },
        update: {
          nombre: seed.nombre,
          esTributario: seed.esTributario,
          tiposComprobanteAplicables: seed.tiposComprobanteAplicables,
        },
      });
    }
  }

  /**
   * Mapea P2002 (UNIQUE violation) al `DomainError` correcto inspeccionando
   * `meta.target`. Cualquier otro código de Prisma se propaga sin tocar.
   */
  private mapKnownError(
    err: unknown,
    ctx: { codigo: string | undefined; nombre: string | undefined },
  ): unknown {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === 'P2002'
    ) {
      const target = err.meta?.['target'];
      const targetStr = Array.isArray(target)
        ? target.join(',')
        : typeof target === 'string'
          ? target
          : '';
      // Prisma reporta el target del UNIQUE en distintas formas según la
      // versión: a veces un string con el nombre del index, a veces un array
      // de columnas. Cubrimos ambos casos.
      if (targetStr.includes('codigo')) {
        return new TipoDocumentoFisicoCodigoDuplicadoError(ctx.codigo ?? '');
      }
      if (targetStr.includes('nombre')) {
        return new TipoDocumentoFisicoNombreDuplicadoError(ctx.nombre ?? '');
      }
    }
    return err;
  }
}
