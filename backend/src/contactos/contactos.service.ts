import { Inject, Injectable } from '@nestjs/common';
import type { Contacto } from '@prisma/client';

import {
  ContactoDocumentoDuplicadoError,
  ContactoNoEncontradoError,
  ContactoReferenciadoError,
} from './domain/contacto-errors';
import {
  normalizarDocumento,
  normalizarOpcional,
  validarFlags,
  validarRazonSocial,
} from './domain/contacto-validator';
import {
  CONTACTOS_REPOSITORY_PORT,
  ContactosRepositoryPort,
} from './ports/contactos.repository.port';

// ============================================================
// Inputs del service — los DTOs HTTP (commit 5) van a mapear a estos
// ============================================================

export interface CrearContactoInput {
  razonSocial: string;
  nombreComercial?: string | null;
  documento?: string | null;
  esCliente: boolean;
  esProveedor: boolean;
  email?: string | null;
  telefono?: string | null;
  direccion?: string | null;
}

export interface ActualizarContactoInput {
  razonSocial?: string;
  nombreComercial?: string | null;
  documento?: string | null;
  esCliente?: boolean;
  esProveedor?: boolean;
  email?: string | null;
  telefono?: string | null;
  direccion?: string | null;
}

export interface ListarContactosInput {
  q?: string;
  documento?: string;
  esCliente?: boolean;
  esProveedor?: boolean;
  /** true default → sólo activos; false → sólo inactivos; 'all' → ambos. */
  activo?: boolean | 'all';
  page?: number;
  limit?: number;
  orderBy?: 'razonSocial' | 'createdAt';
  orderDir?: 'asc' | 'desc';
}

export interface ListarContactosResult {
  items: Contacto[];
  total: number;
  page: number;
  limit: number;
}

// ============================================================
// Defaults / límites
// ============================================================

const LIST_DEFAULT_LIMIT = 50;
const LIST_MAX_LIMIT = 200;

// ============================================================
// Service
// ============================================================

@Injectable()
export class ContactosService {
  constructor(
    @Inject(CONTACTOS_REPOSITORY_PORT)
    private readonly repo: ContactosRepositoryPort,
  ) {}

  async crear(
    tenantId: string,
    userId: string,
    input: CrearContactoInput,
  ): Promise<Contacto> {
    validarRazonSocial(input.razonSocial);
    validarFlags(input.esCliente, input.esProveedor);

    const documento = normalizarDocumento(input.documento);
    if (documento !== null) {
      const existente = await this.repo.findByDocumento(tenantId, documento);
      if (existente) {
        throw new ContactoDocumentoDuplicadoError(documento, existente.id);
      }
    }

    return this.repo.create(tenantId, {
      razonSocial: input.razonSocial.trim(),
      nombreComercial: normalizarOpcional(input.nombreComercial),
      documento,
      esCliente: input.esCliente,
      esProveedor: input.esProveedor,
      email: normalizarOpcional(input.email),
      telefono: normalizarOpcional(input.telefono),
      direccion: normalizarOpcional(input.direccion),
      createdByUserId: userId,
    });
  }

  async actualizar(
    tenantId: string,
    id: string,
    input: ActualizarContactoInput,
  ): Promise<Contacto> {
    const actual = await this.repo.findById(tenantId, id);
    if (!actual) throw new ContactoNoEncontradoError(id);

    if (input.razonSocial !== undefined) {
      validarRazonSocial(input.razonSocial);
    }

    // Flags: valido el estado resultante si al menos uno de los dos se toca.
    const esClienteFinal = input.esCliente ?? actual.esCliente;
    const esProveedorFinal = input.esProveedor ?? actual.esProveedor;
    if (input.esCliente !== undefined || input.esProveedor !== undefined) {
      validarFlags(esClienteFinal, esProveedorFinal);
    }

    // Si toca el documento, re-normalizo y chequeo unicidad contra otros.
    const data: Parameters<ContactosRepositoryPort['update']>[2] = {};
    if (input.razonSocial !== undefined) data.razonSocial = input.razonSocial.trim();
    if (input.esCliente !== undefined) data.esCliente = input.esCliente;
    if (input.esProveedor !== undefined) data.esProveedor = input.esProveedor;
    if (input.nombreComercial !== undefined) {
      data.nombreComercial = normalizarOpcional(input.nombreComercial);
    }
    if (input.email !== undefined) {
      data.email = normalizarOpcional(input.email);
    }
    if (input.telefono !== undefined) {
      data.telefono = normalizarOpcional(input.telefono);
    }
    if (input.direccion !== undefined) {
      data.direccion = normalizarOpcional(input.direccion);
    }
    if (input.documento !== undefined) {
      const documentoNormalizado = normalizarDocumento(input.documento);
      if (documentoNormalizado !== null && documentoNormalizado !== actual.documento) {
        const existente = await this.repo.findByDocumento(tenantId, documentoNormalizado);
        if (existente && existente.id !== id) {
          throw new ContactoDocumentoDuplicadoError(documentoNormalizado, existente.id);
        }
      }
      data.documento = documentoNormalizado;
    }

    return this.repo.update(tenantId, id, data);
  }

  async obtener(tenantId: string, id: string): Promise<Contacto> {
    const c = await this.repo.findById(tenantId, id);
    if (!c) throw new ContactoNoEncontradoError(id);
    return c;
  }

  async listar(
    tenantId: string,
    input: ListarContactosInput,
  ): Promise<ListarContactosResult> {
    const page = input.page && input.page > 0 ? input.page : 1;
    const limit = Math.min(
      input.limit && input.limit > 0 ? input.limit : LIST_DEFAULT_LIMIT,
      LIST_MAX_LIMIT,
    );

    const filtros: Parameters<ContactosRepositoryPort['listar']>[1] = {};
    if (input.q !== undefined) filtros.q = input.q;
    if (input.documento !== undefined) filtros.documento = input.documento;
    if (input.esCliente !== undefined) filtros.esCliente = input.esCliente;
    if (input.esProveedor !== undefined) filtros.esProveedor = input.esProveedor;
    if (input.activo !== undefined) filtros.activo = input.activo;

    const pagination: Parameters<ContactosRepositoryPort['listar']>[2] = {
      page,
      limit,
    };
    if (input.orderBy !== undefined) pagination.orderBy = input.orderBy;
    if (input.orderDir !== undefined) pagination.orderDir = input.orderDir;

    const { items, total } = await this.repo.listar(tenantId, filtros, pagination);
    return { items, total, page, limit };
  }

  async desactivar(tenantId: string, id: string): Promise<Contacto> {
    const actual = await this.repo.findById(tenantId, id);
    if (!actual) throw new ContactoNoEncontradoError(id);
    if (!actual.activo) return actual; // idempotente
    return this.repo.setActivo(tenantId, id, false);
  }

  async reactivar(tenantId: string, id: string): Promise<Contacto> {
    const actual = await this.repo.findById(tenantId, id);
    if (!actual) throw new ContactoNoEncontradoError(id);
    if (actual.activo) return actual; // idempotente
    return this.repo.setActivo(tenantId, id, true);
  }

  async eliminar(tenantId: string, id: string): Promise<void> {
    const actual = await this.repo.findById(tenantId, id);
    if (!actual) throw new ContactoNoEncontradoError(id);

    const referencias = await this.repo.countLineasReferenciadoras(tenantId, id);
    if (referencias > 0) {
      throw new ContactoReferenciadoError(id, referencias);
    }

    // Si una línea aparece entre el count y el delete, la FK Restrict
    // de Postgres se activa y el adapter lanza ContactoReferenciadoError
    // (sin count). Ver adapters/prisma-contactos.repository.ts.
    await this.repo.eliminar(tenantId, id);
  }
}
