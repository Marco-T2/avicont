import { Injectable } from '@nestjs/common';
import type { Item } from '@prisma/client';
import { Prisma } from '@prisma/client';

import { PrismaService } from '@/common/prisma.service';

import { ItemCodigoDuplicadoError } from '../domain/item-errors';
import {
  ItemCreateData,
  ItemListarFiltros,
  ItemListarPagination,
  ItemUpdateData,
  ItemsRepositoryPort,
} from '../ports/items.repository.port';

@Injectable()
export class PrismaItemsRepository extends ItemsRepositoryPort {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async create(
    tenantId: string,
    data: ItemCreateData,
    tx?: Prisma.TransactionClient,
  ): Promise<Item> {
    const client = tx ?? this.prisma;
    try {
      return await client.item.create({
        data: {
          organizationId: tenantId,
          codigo: data.codigo,
          nombre: data.nombre,
          tipo: data.tipo,
          unidadMedida: data.unidadMedida,
          precioUnitarioSugerido: data.precioUnitarioSugerido,
          // Ausente ⇒ lo pone el default del schema (1). No se manda 1 desde
          // acá para que el default viva en un solo lugar.
          ...(data.cantidadPorDefecto !== null
            ? { cantidadPorDefecto: data.cantidadPorDefecto }
            : {}),
          cuentaIngresoId: data.cuentaIngresoId,
          createdByUserId: data.createdByUserId,
        },
      });
    } catch (err) {
      throw this.traducirCodigoDuplicado(err, data.codigo);
    }
  }

  async update(
    tenantId: string,
    id: string,
    data: ItemUpdateData,
    tx?: Prisma.TransactionClient,
  ): Promise<Item> {
    const client = tx ?? this.prisma;
    // exactOptionalPropertyTypes: spread condicional para no pasar
    // `undefined` a Prisma (§2.5.1).
    const updateData: Prisma.ItemUpdateInput = {
      ...(data.codigo !== undefined ? { codigo: data.codigo } : {}),
      ...(data.nombre !== undefined ? { nombre: data.nombre } : {}),
      ...(data.tipo !== undefined ? { tipo: data.tipo } : {}),
      ...(data.unidadMedida !== undefined ? { unidadMedida: data.unidadMedida } : {}),
      ...(data.precioUnitarioSugerido !== undefined
        ? { precioUnitarioSugerido: data.precioUnitarioSugerido }
        : {}),
      ...(data.cantidadPorDefecto !== undefined
        ? { cantidadPorDefecto: data.cantidadPorDefecto }
        : {}),
      ...(data.cuentaIngresoId !== undefined ? { cuentaIngresoId: data.cuentaIngresoId } : {}),
    };
    try {
      return await client.item.update({
        where: { id, organizationId: tenantId },
        data: updateData,
      });
    } catch (err) {
      throw this.traducirCodigoDuplicado(err, data.codigo ?? null);
    }
  }

  async setActivo(
    tenantId: string,
    id: string,
    activo: boolean,
    tx?: Prisma.TransactionClient,
  ): Promise<Item> {
    const client = tx ?? this.prisma;
    return client.item.update({
      where: { id, organizationId: tenantId },
      data: { activo },
    });
  }

  async findById(
    tenantId: string,
    id: string,
    tx?: Prisma.TransactionClient,
  ): Promise<Item | null> {
    const client = tx ?? this.prisma;
    return client.item.findFirst({ where: { id, organizationId: tenantId } });
  }

  async findByCodigo(
    tenantId: string,
    codigo: string | null,
    tx?: Prisma.TransactionClient,
  ): Promise<Item | null> {
    if (codigo === null || codigo === '') return null;
    const client = tx ?? this.prisma;
    return client.item.findFirst({ where: { organizationId: tenantId, codigo } });
  }

  async listar(
    tenantId: string,
    filtros: ItemListarFiltros,
    pagination: ItemListarPagination,
    tx?: Prisma.TransactionClient,
  ): Promise<{ items: Item[]; total: number }> {
    const client = tx ?? this.prisma;

    const where: Prisma.ItemWhereInput = {
      organizationId: tenantId,
      ...(filtros.tipo !== undefined ? { tipo: filtros.tipo } : {}),
      ...(filtros.activo !== 'all' ? { activo: filtros.activo ?? true } : {}),
      ...(filtros.q !== undefined && filtros.q.trim().length > 0
        ? {
            OR: [
              { nombre: { contains: filtros.q, mode: 'insensitive' } },
              { codigo: { contains: filtros.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const orderBy: Prisma.ItemOrderByWithRelationInput = {
      [pagination.orderBy ?? 'nombre']: pagination.orderDir ?? 'asc',
    };

    const skip = (pagination.page - 1) * pagination.limit;
    const [items, total] = await Promise.all([
      client.item.findMany({ where, orderBy, skip, take: pagination.limit }),
      client.item.count({ where }),
    ]);
    return { items, total };
  }

  /**
   * Traduce el P2002 del UNIQUE PARCIAL al error de dominio. Cubre la race
   * condition entre el pre-check del service y el INSERT: sin esto el usuario
   * recibiría un 500 críptico en vez del 409 (Anti-23, cicatriz F-01).
   *
   * Devuelve el error a lanzar (no lanza) para que el `catch` del caller
   * mantenga el `throw` visible.
   */
  private traducirCodigoDuplicado(err: unknown, codigo: string | null): unknown {
    if (
      codigo !== null &&
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === 'P2002'
    ) {
      return new ItemCodigoDuplicadoError(codigo);
    }
    return err;
  }
}
