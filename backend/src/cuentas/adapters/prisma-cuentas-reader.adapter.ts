import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import { PrismaService } from '@/common/prisma.service';

import { CuentaParaLinea, CuentasReaderPort } from '../ports/cuentas-reader.port';

@Injectable()
export class PrismaCuentasReaderAdapter extends CuentasReaderPort {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async obtenerBatch(
    tenantId: string,
    cuentaIds: string[],
    tx?: Prisma.TransactionClient,
  ): Promise<Map<string, CuentaParaLinea>> {
    if (cuentaIds.length === 0) return new Map();

    // Dedup para no mandar ids repetidos a la query (no cambia el resultado
    // pero evita trabajo si el caller pasó el mismo cuentaId en varias líneas).
    const uniqueIds = Array.from(new Set(cuentaIds));

    const client = tx ?? this.prisma;
    const rows = await client.cuenta.findMany({
      where: { id: { in: uniqueIds }, organizationId: tenantId },
      select: {
        id: true,
        codigoInterno: true,
        nombre: true,
        activa: true,
        esDetalle: true,
        requiereContacto: true,
        permiteMultiMoneda: true,
        monedaFuncional: true,
      },
    });

    return new Map(rows.map((r) => [r.id, r]));
  }
}
