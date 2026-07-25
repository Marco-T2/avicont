import { Injectable } from '@nestjs/common';
import type { ImportacionExtracto } from '@prisma/client';
import { Prisma } from '@prisma/client';

import { PrismaService } from '@/common/prisma.service';

import {
  CoberturaImportacionRow,
  ImportacionExtractoCreateData,
  ImportacionExtractoRepositoryPort,
  ListarImportacionesPagination,
} from '../ports/importacion-extracto.repository.port';

@Injectable()
export class PrismaImportacionExtractoRepository extends ImportacionExtractoRepositoryPort {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async crear(
    tenantId: string,
    data: ImportacionExtractoCreateData,
    tx?: Prisma.TransactionClient,
  ): Promise<ImportacionExtracto> {
    const client = tx ?? this.prisma;
    return client.importacionExtracto.create({
      data: {
        organizationId: tenantId,
        cuentaBancariaId: data.cuentaBancariaId,
        nombreArchivo: data.nombreArchivo,
        sha256Archivo: data.sha256Archivo,
        tamanioBytes: data.tamanioBytes,
        perfilExtracto: data.perfilExtracto,
        fechaDesde: data.fechaDesde,
        fechaHasta: data.fechaHasta,
        coberturaDeclarada: data.coberturaDeclarada,
        saldoInicial: data.saldoInicial,
        saldoFinal: data.saldoFinal,
        estadoVerificacion: data.estadoVerificacion,
        diferencia: data.diferencia,
        filasLeidas: data.filasLeidas,
        movimientosNuevos: data.movimientosNuevos,
        movimientosDuplicados: data.movimientosDuplicados,
        importadoPorUserId: data.importadoPorUserId,
      },
    });
  }

  async findById(
    tenantId: string,
    id: string,
    tx?: Prisma.TransactionClient,
  ): Promise<ImportacionExtracto | null> {
    const client = tx ?? this.prisma;
    return client.importacionExtracto.findFirst({ where: { id, organizationId: tenantId } });
  }

  async listarCoberturaPorCuentaBancaria(
    tenantId: string,
    cuentaBancariaId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<CoberturaImportacionRow[]> {
    const client = tx ?? this.prisma;
    return client.importacionExtracto.findMany({
      // organizationId PRIMER predicado (§4.2 Anti-31).
      where: { organizationId: tenantId, cuentaBancariaId },
      select: {
        id: true,
        fechaDesde: true,
        fechaHasta: true,
        saldoInicial: true,
        saldoFinal: true,
      },
      orderBy: { fechaDesde: 'asc' },
    });
  }

  async listarPorCuentaBancaria(
    tenantId: string,
    cuentaBancariaId: string,
    pagination: ListarImportacionesPagination,
    tx?: Prisma.TransactionClient,
  ): Promise<{ items: ImportacionExtracto[]; total: number }> {
    const client = tx ?? this.prisma;
    const where: Prisma.ImportacionExtractoWhereInput = {
      organizationId: tenantId,
      cuentaBancariaId,
    };
    const skip = (pagination.page - 1) * pagination.limit;

    const [items, total] = await Promise.all([
      client.importacionExtracto.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: pagination.limit,
      }),
      client.importacionExtracto.count({ where }),
    ]);
    return { items, total };
  }

  async actualizarContadores(
    tenantId: string,
    id: string,
    contadores: { movimientosNuevos: number; movimientosDuplicados: number },
    tx?: Prisma.TransactionClient,
  ): Promise<ImportacionExtracto> {
    const client = tx ?? this.prisma;
    return client.importacionExtracto.update({
      where: { id, organizationId: tenantId },
      data: {
        movimientosNuevos: contadores.movimientosNuevos,
        movimientosDuplicados: contadores.movimientosDuplicados,
      },
    });
  }

  async existePorSha256(
    tenantId: string,
    cuentaBancariaId: string,
    sha256Archivo: string,
    tx?: Prisma.TransactionClient,
  ): Promise<boolean> {
    const client = tx ?? this.prisma;
    const existente = await client.importacionExtracto.findFirst({
      where: { organizationId: tenantId, cuentaBancariaId, sha256Archivo },
      select: { id: true },
    });
    return existente !== null;
  }
}
