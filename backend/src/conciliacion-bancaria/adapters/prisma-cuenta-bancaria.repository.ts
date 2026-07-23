import { Injectable } from '@nestjs/common';
import type { CuentaBancaria, PerfilExtracto } from '@prisma/client';
import { Prisma } from '@prisma/client';

import { PrismaService } from '@/common/prisma.service';

import { CuentaBancariaConMovimientosError } from '../domain/cuenta-bancaria-errors';
import {
  CuentaBancariaCreateData,
  CuentaBancariaRepositoryPort,
  CuentaBancariaUpdateData,
  ListarCuentasBancariasFiltros,
  ListarCuentasBancariasPagination,
} from '../ports/cuenta-bancaria.repository.port';

@Injectable()
export class PrismaCuentaBancariaRepository extends CuentaBancariaRepositoryPort {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async create(
    tenantId: string,
    data: CuentaBancariaCreateData,
    tx?: Prisma.TransactionClient,
  ): Promise<CuentaBancaria> {
    const client = tx ?? this.prisma;
    return client.cuentaBancaria.create({
      data: {
        organizationId: tenantId,
        cuentaId: data.cuentaId,
        alias: data.alias,
        perfilExtracto: data.perfilExtracto,
        numeroCuenta: data.numeroCuenta,
        moneda: data.moneda,
      },
    });
  }

  async findById(
    tenantId: string,
    id: string,
    tx?: Prisma.TransactionClient,
  ): Promise<CuentaBancaria | null> {
    const client = tx ?? this.prisma;
    return client.cuentaBancaria.findFirst({ where: { id, organizationId: tenantId } });
  }

  async findByCuentaId(
    tenantId: string,
    cuentaId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<CuentaBancaria | null> {
    const client = tx ?? this.prisma;
    return client.cuentaBancaria.findFirst({ where: { organizationId: tenantId, cuentaId } });
  }

  async findByPerfilYNumero(
    tenantId: string,
    perfilExtracto: PerfilExtracto,
    numeroCuenta: string,
    excludeId?: string,
    tx?: Prisma.TransactionClient,
  ): Promise<CuentaBancaria | null> {
    const client = tx ?? this.prisma;
    return client.cuentaBancaria.findFirst({
      where: {
        organizationId: tenantId,
        perfilExtracto,
        numeroCuenta,
        ...(excludeId !== undefined ? { id: { not: excludeId } } : {}),
      },
    });
  }

  async listar(
    tenantId: string,
    filtros: ListarCuentasBancariasFiltros,
    pagination: ListarCuentasBancariasPagination,
    tx?: Prisma.TransactionClient,
  ): Promise<{ items: CuentaBancaria[]; total: number }> {
    const client = tx ?? this.prisma;

    const activaFilter: boolean | undefined =
      filtros.activa === 'all' ? undefined : (filtros.activa ?? true);

    const where: Prisma.CuentaBancariaWhereInput = {
      organizationId: tenantId,
      ...(activaFilter !== undefined ? { activa: activaFilter } : {}),
    };

    const skip = (pagination.page - 1) * pagination.limit;
    const [items, total] = await Promise.all([
      client.cuentaBancaria.findMany({
        where,
        orderBy: { alias: 'asc' },
        skip,
        take: pagination.limit,
      }),
      client.cuentaBancaria.count({ where }),
    ]);
    return { items, total };
  }

  async update(
    tenantId: string,
    id: string,
    data: CuentaBancariaUpdateData,
    tx?: Prisma.TransactionClient,
  ): Promise<CuentaBancaria> {
    const client = tx ?? this.prisma;
    // exactOptionalPropertyTypes: spread condicional (CLAUDE.md §2.5.1).
    const updateData: Prisma.CuentaBancariaUpdateInput = {
      ...(data.alias !== undefined ? { alias: data.alias } : {}),
      ...(data.numeroCuenta !== undefined ? { numeroCuenta: data.numeroCuenta } : {}),
      ...(data.moneda !== undefined ? { moneda: data.moneda } : {}),
      ...(data.activa !== undefined ? { activa: data.activa } : {}),
    };
    return client.cuentaBancaria.update({
      where: { id, organizationId: tenantId },
      data: updateData,
    });
  }

  async eliminar(tenantId: string, id: string, tx?: Prisma.TransactionClient): Promise<number> {
    const client = tx ?? this.prisma;
    try {
      const result = await client.cuentaBancaria.deleteMany({
        where: { id, organizationId: tenantId },
      });
      return result.count;
    } catch (err) {
      // FK Restrict desde movimientos_bancarios/importaciones_extracto.cuentaBancariaId
      // (esas tablas llegan en slice 3 — defense in depth desde ya, CLAUDE.md §4.8).
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2003') {
        throw new CuentaBancariaConMovimientosError(id);
      }
      throw err;
    }
  }
}
