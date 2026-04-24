import { Injectable } from '@nestjs/common';
import type { Contacto } from '@prisma/client';
import { Prisma } from '@prisma/client';

import { PrismaService } from '@/common/prisma.service';

import { ContactoReferenciadoError } from '../domain/contacto-errors';
import {
  ContactoCreateData,
  ContactoListarFiltros,
  ContactoListarPagination,
  ContactoUpdateData,
  ContactosRepositoryPort,
} from '../ports/contactos.repository.port';

@Injectable()
export class PrismaContactosRepository extends ContactosRepositoryPort {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async create(
    tenantId: string,
    data: ContactoCreateData,
    tx?: Prisma.TransactionClient,
  ): Promise<Contacto> {
    const client = tx ?? this.prisma;
    return client.contacto.create({
      data: {
        organizationId: tenantId,
        razonSocial: data.razonSocial,
        nombreComercial: data.nombreComercial,
        documento: data.documento,
        esCliente: data.esCliente,
        esProveedor: data.esProveedor,
        email: data.email,
        telefono: data.telefono,
        direccion: data.direccion,
        createdByUserId: data.createdByUserId,
      },
    });
  }

  async update(
    tenantId: string,
    id: string,
    data: ContactoUpdateData,
    tx?: Prisma.TransactionClient,
  ): Promise<Contacto> {
    const client = tx ?? this.prisma;
    // exactOptionalPropertyTypes: usar spread condicional para no pasar
    // `undefined` a Prisma (CLAUDE.md §2.5.1).
    const updateData: Prisma.ContactoUpdateInput = {
      ...(data.razonSocial !== undefined ? { razonSocial: data.razonSocial } : {}),
      ...(data.nombreComercial !== undefined ? { nombreComercial: data.nombreComercial } : {}),
      ...(data.documento !== undefined ? { documento: data.documento } : {}),
      ...(data.esCliente !== undefined ? { esCliente: data.esCliente } : {}),
      ...(data.esProveedor !== undefined ? { esProveedor: data.esProveedor } : {}),
      ...(data.email !== undefined ? { email: data.email } : {}),
      ...(data.telefono !== undefined ? { telefono: data.telefono } : {}),
      ...(data.direccion !== undefined ? { direccion: data.direccion } : {}),
    };
    return client.contacto.update({
      where: { id, organizationId: tenantId },
      data: updateData,
    });
  }

  async setActivo(
    tenantId: string,
    id: string,
    activo: boolean,
    tx?: Prisma.TransactionClient,
  ): Promise<Contacto> {
    const client = tx ?? this.prisma;
    return client.contacto.update({
      where: { id, organizationId: tenantId },
      data: { activo },
    });
  }

  async findById(
    tenantId: string,
    id: string,
    tx?: Prisma.TransactionClient,
  ): Promise<Contacto | null> {
    const client = tx ?? this.prisma;
    return client.contacto.findFirst({
      where: { id, organizationId: tenantId },
    });
  }

  async findByDocumento(
    tenantId: string,
    documento: string | null,
    tx?: Prisma.TransactionClient,
  ): Promise<Contacto | null> {
    if (documento === null || documento === '') return null;
    const client = tx ?? this.prisma;
    return client.contacto.findFirst({
      where: { organizationId: tenantId, documento },
    });
  }

  async listar(
    tenantId: string,
    filtros: ContactoListarFiltros,
    pagination: ContactoListarPagination,
    tx?: Prisma.TransactionClient,
  ): Promise<{ items: Contacto[]; total: number }> {
    const client = tx ?? this.prisma;

    const activoFilter: Prisma.BoolFilter | boolean =
      filtros.activo === 'all' ? {} : (filtros.activo ?? true);

    const where: Prisma.ContactoWhereInput = {
      organizationId: tenantId,
      ...(filtros.esCliente !== undefined ? { esCliente: filtros.esCliente } : {}),
      ...(filtros.esProveedor !== undefined ? { esProveedor: filtros.esProveedor } : {}),
      ...(filtros.documento !== undefined ? { documento: filtros.documento } : {}),
      ...(filtros.activo !== 'all' ? { activo: activoFilter as boolean } : {}),
      ...(filtros.q !== undefined && filtros.q.trim().length > 0
        ? {
            OR: [
              { razonSocial: { contains: filtros.q, mode: 'insensitive' } },
              { nombreComercial: { contains: filtros.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const orderBy: Prisma.ContactoOrderByWithRelationInput = {
      [pagination.orderBy ?? 'razonSocial']: pagination.orderDir ?? 'asc',
    };

    const skip = (pagination.page - 1) * pagination.limit;
    const [items, total] = await Promise.all([
      client.contacto.findMany({
        where,
        orderBy,
        skip,
        take: pagination.limit,
      }),
      client.contacto.count({ where }),
    ]);
    return { items, total };
  }

  async eliminar(
    tenantId: string,
    id: string,
    tx?: Prisma.TransactionClient,
  ): Promise<number> {
    const client = tx ?? this.prisma;
    // Convertimos P2003 (FK Restrict violada) a ContactoReferenciadoError
    // para cubrir la race condition donde una línea aparece entre el
    // count previo del service y este delete. Sin count porque no lo
    // recomputamos — el mensaje al usuario es el mismo.
    try {
      const result = await client.contacto.deleteMany({
        where: { id, organizationId: tenantId },
      });
      return result.count;
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2003') {
        throw new ContactoReferenciadoError(id);
      }
      throw err;
    }
  }

  async countLineasReferenciadoras(
    tenantId: string,
    contactoId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<number> {
    const client = tx ?? this.prisma;
    return client.lineaComprobante.count({
      where: { organizationId: tenantId, contactoId },
    });
  }
}
