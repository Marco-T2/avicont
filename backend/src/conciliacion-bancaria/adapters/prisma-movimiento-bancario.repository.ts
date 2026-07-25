import { Injectable } from '@nestjs/common';
import type { EstadoMovimientoBancario, MovimientoBancario } from '@prisma/client';
import { Prisma } from '@prisma/client';

import { PrismaService } from '@/common/prisma.service';

import { MovimientoBancarioNoEncontradoError } from '../domain/conciliacion-errors';
import {
  MovimientoBancarioCreateData,
  MovimientoBancarioRepositoryPort,
} from '../ports/movimiento-bancario.repository.port';

@Injectable()
export class PrismaMovimientoBancarioRepository extends MovimientoBancarioRepositoryPort {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async crearMuchos(
    tenantId: string,
    cuentaBancariaId: string,
    importacionId: string,
    movimientos: readonly MovimientoBancarioCreateData[],
    tx?: Prisma.TransactionClient,
  ): Promise<{ insertados: number }> {
    if (movimientos.length === 0) return { insertados: 0 };
    const client = tx ?? this.prisma;

    const resultado = await client.movimientoBancario.createMany({
      data: movimientos.map((m) => ({
        organizationId: tenantId,
        cuentaBancariaId,
        importacionId,
        fecha: m.fecha,
        hora: m.hora,
        monto: m.monto,
        tipo: m.tipo,
        moneda: m.moneda,
        descripcion: m.descripcion,
        descripcionNormalizada: m.descripcionNormalizada,
        referencia: m.referencia,
        saldo: m.saldo,
        contraparteNombre: m.contraparteNombre,
        contraparteDocumento: m.contraparteDocumento,
        datosOriginales: m.datosOriginales,
        ordinalDia: m.ordinalDia,
        ordenFisico: m.ordenFisico,
        hashDedup: m.hashDedup,
      })),
      skipDuplicates: true, // @@unique([cuentaBancariaId, hashDedup]) — idempotencia ESTRUCTURAL (design §6.1)
    });

    return { insertados: resultado.count };
  }

  async contarPorCuentaBancaria(
    tenantId: string,
    cuentaBancariaId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<number> {
    const client = tx ?? this.prisma;
    return client.movimientoBancario.count({
      where: { organizationId: tenantId, cuentaBancariaId },
    });
  }

  async listarPorCuentaBancariaEnRango(
    tenantId: string,
    cuentaBancariaId: string,
    rango: { fechaDesde: Date; fechaHasta: Date },
    tx?: Prisma.TransactionClient,
  ): Promise<MovimientoBancario[]> {
    const client = tx ?? this.prisma;
    return client.movimientoBancario.findMany({
      where: {
        organizationId: tenantId,
        cuentaBancariaId,
        fecha: { gte: rango.fechaDesde, lte: rango.fechaHasta },
      },
      orderBy: [{ fecha: 'asc' }, { ordinalDia: 'asc' }, { id: 'asc' }],
    });
  }

  async findById(
    tenantId: string,
    id: string,
    tx?: Prisma.TransactionClient,
  ): Promise<MovimientoBancario | null> {
    const client = tx ?? this.prisma;
    return client.movimientoBancario.findFirst({
      where: { id, organizationId: tenantId },
    });
  }

  async actualizarEstado(
    tenantId: string,
    id: string,
    estado: EstadoMovimientoBancario,
    tx?: Prisma.TransactionClient,
  ): Promise<MovimientoBancario> {
    const client = tx ?? this.prisma;
    // updateMany + re-lectura en vez de `update`: `update` exige un unique y
    // dejaría `organizationId` fuera del WHERE (Anti-31).
    const { count } = await client.movimientoBancario.updateMany({
      where: { id, organizationId: tenantId },
      data: { estado },
    });
    if (count === 0) {
      throw new MovimientoBancarioNoEncontradoError(id);
    }
    const actualizado = await client.movimientoBancario.findFirstOrThrow({
      where: { id, organizationId: tenantId },
    });
    return actualizado;
  }
}
