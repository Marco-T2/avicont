import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '@/common/prisma.service';

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
}
