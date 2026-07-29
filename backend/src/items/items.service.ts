import { Inject, Injectable } from '@nestjs/common';
import type { Item, TipoItem } from '@prisma/client';

import { CUENTAS_READER_PORT, CuentasReaderPort } from '@/cuentas/ports/cuentas-reader.port';

import {
  ItemCodigoDuplicadoError,
  ItemCuentaIngresoInvalidaError,
  ItemNoEncontradoError,
} from './domain/item-errors';
import { normalizarCodigo, normalizarOpcional } from './domain/item-validator';
import { ITEMS_REPOSITORY_PORT, ItemsRepositoryPort } from './ports/items.repository.port';

export interface CrearItemInput {
  nombre: string;
  tipo: TipoItem;
  codigo?: string | null;
  unidadMedida?: string | null;
  precioUnitarioSugerido?: string | null;
  cantidadPorDefecto?: string | null;
  cuentaIngresoId?: string | null;
}

export interface ActualizarItemInput {
  nombre?: string;
  tipo?: TipoItem;
  codigo?: string | null;
  unidadMedida?: string | null;
  precioUnitarioSugerido?: string | null;
  cantidadPorDefecto?: string;
  cuentaIngresoId?: string | null;
}

export interface ListarItemsInput {
  q?: string;
  tipo?: TipoItem;
  activo?: boolean | 'all';
  page?: number;
  limit?: number;
  orderBy?: 'nombre' | 'codigo' | 'createdAt';
  orderDir?: 'asc' | 'desc';
}

export interface ListarItemsResult {
  items: Item[];
  total: number;
  page: number;
  limit: number;
}

const LIST_DEFAULT_LIMIT = 50;
const LIST_MAX_LIMIT = 200;

@Injectable()
export class ItemsService {
  constructor(
    @Inject(ITEMS_REPOSITORY_PORT)
    private readonly repo: ItemsRepositoryPort,
    @Inject(CUENTAS_READER_PORT)
    private readonly cuentas: CuentasReaderPort,
  ) {}

  async crear(tenantId: string, userId: string, input: CrearItemInput): Promise<Item> {
    const codigo = normalizarCodigo(input.codigo);
    await this.exigirCodigoLibre(tenantId, codigo);

    const cuentaIngresoId = input.cuentaIngresoId ?? null;
    if (cuentaIngresoId !== null) {
      await this.exigirCuentaIngresoValida(tenantId, cuentaIngresoId);
    }

    return this.repo.create(tenantId, {
      codigo,
      nombre: input.nombre.trim(),
      tipo: input.tipo,
      unidadMedida: normalizarOpcional(input.unidadMedida),
      precioUnitarioSugerido: input.precioUnitarioSugerido ?? null,
      cantidadPorDefecto: input.cantidadPorDefecto ?? null,
      cuentaIngresoId,
      createdByUserId: userId,
    });
  }

  async actualizar(tenantId: string, id: string, input: ActualizarItemInput): Promise<Item> {
    const actual = await this.repo.findById(tenantId, id);
    if (!actual) throw new ItemNoEncontradoError(id);

    const data: Parameters<ItemsRepositoryPort['update']>[2] = {};
    if (input.nombre !== undefined) data.nombre = input.nombre.trim();
    if (input.tipo !== undefined) data.tipo = input.tipo;
    if (input.unidadMedida !== undefined) {
      data.unidadMedida = normalizarOpcional(input.unidadMedida);
    }
    if (input.precioUnitarioSugerido !== undefined) {
      data.precioUnitarioSugerido = input.precioUnitarioSugerido;
    }
    if (input.cantidadPorDefecto !== undefined) {
      data.cantidadPorDefecto = input.cantidadPorDefecto;
    }

    if (input.codigo !== undefined) {
      const codigo = normalizarCodigo(input.codigo);
      // Se excluye el ítem propio: el ocupante del código suele ser él mismo
      // (reenviarlo sin cambios es lo normal en un PATCH), y sin la exclusión
      // no se podría guardar ningún otro campo.
      await this.exigirCodigoLibre(tenantId, codigo, id);
      data.codigo = codigo;
    }

    if (input.cuentaIngresoId !== undefined) {
      // null = limpiar: al vender cae al concepto `ventasId` de la
      // configuración, así que no hay nada que validar.
      if (input.cuentaIngresoId !== null) {
        await this.exigirCuentaIngresoValida(tenantId, input.cuentaIngresoId);
      }
      data.cuentaIngresoId = input.cuentaIngresoId;
    }

    return this.repo.update(tenantId, id, data);
  }

  async obtener(tenantId: string, id: string): Promise<Item> {
    const item = await this.repo.findById(tenantId, id);
    if (!item) throw new ItemNoEncontradoError(id);
    return item;
  }

  async listar(tenantId: string, input: ListarItemsInput): Promise<ListarItemsResult> {
    const page = input.page !== undefined && input.page > 0 ? input.page : 1;
    const limit = Math.min(
      input.limit !== undefined && input.limit > 0 ? input.limit : LIST_DEFAULT_LIMIT,
      LIST_MAX_LIMIT,
    );

    const filtros: Parameters<ItemsRepositoryPort['listar']>[1] = {};
    if (input.q !== undefined) filtros.q = input.q;
    if (input.tipo !== undefined) filtros.tipo = input.tipo;
    if (input.activo !== undefined) filtros.activo = input.activo;

    const pagination: Parameters<ItemsRepositoryPort['listar']>[2] = { page, limit };
    if (input.orderBy !== undefined) pagination.orderBy = input.orderBy;
    if (input.orderDir !== undefined) pagination.orderDir = input.orderDir;

    const { items, total } = await this.repo.listar(tenantId, filtros, pagination);
    return { items, total, page, limit };
  }

  /**
   * Desactiva el ítem. Idempotente. NO borra: las ventas existentes conservan
   * su `itemId` y sus snapshots (REQ-ITM-01).
   */
  async desactivar(tenantId: string, id: string): Promise<Item> {
    await this.obtener(tenantId, id);
    return this.repo.setActivo(tenantId, id, false);
  }

  async reactivar(tenantId: string, id: string): Promise<Item> {
    await this.obtener(tenantId, id);
    return this.repo.setActivo(tenantId, id, true);
  }

  /**
   * Mitad amigable del enforcement simultáneo del UNIQUE PARCIAL (Anti-23).
   * El constraint sigue siendo la garantía dura bajo concurrencia.
   */
  private async exigirCodigoLibre(
    tenantId: string,
    codigo: string | null,
    idPropio?: string,
  ): Promise<void> {
    if (codigo === null) return;
    const existente = await this.repo.findByCodigo(tenantId, codigo);
    if (existente !== null && existente.id !== idPropio) {
      throw new ItemCodigoDuplicadoError(codigo, existente.id);
    }
  }

  private async exigirCuentaIngresoValida(tenantId: string, cuentaId: string): Promise<void> {
    const cuentas = await this.cuentas.obtenerBatch(tenantId, [cuentaId]);
    const cuenta = cuentas.get(cuentaId);
    // Ausente ⇒ no existe O es de otro tenant. El port no distingue a
    // propósito, y el error tampoco: revelar cuál de las dos cosas es
    // filtraría la existencia de recursos ajenos (§4.2).
    if (cuenta === undefined) {
      throw new ItemCuentaIngresoInvalidaError(cuentaId, 'NO_ENCONTRADA');
    }
    if (!cuenta.esDetalle) {
      throw new ItemCuentaIngresoInvalidaError(cuentaId, 'NO_ES_DETALLE');
    }
    if (!cuenta.activa) {
      throw new ItemCuentaIngresoInvalidaError(cuentaId, 'INACTIVA');
    }
  }
}
