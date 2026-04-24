import { Injectable } from '@nestjs/common';
import type { Prisma, TipoComprobante } from '@prisma/client';

import { PrismaService } from '@/common/prisma.service';

import { SecuenciaComprobantePort } from '../ports/secuencia-comprobante.port';

@Injectable()
export class PrismaSecuenciaComprobanteAdapter extends SecuenciaComprobantePort {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async siguienteCorrelativo(
    tenantId: string,
    tipo: TipoComprobante,
    year: number,
    month: number,
    tx?: Prisma.TransactionClient,
  ): Promise<number> {
    const client = tx ?? this.prisma;

    // Statement único atómico: inserta con ultimoNumero=1 si no existe la
    // fila, o incrementa el existente en 1 si ya existe. Postgres serializa
    // writers concurrentes sobre el mismo (organizationId, tipo, year, month)
    // por el row-lock implícito del UNIQUE constraint (PK compuesta).
    //
    // El output es el nuevo valor — garantizado consecutivo, sin gaps ni
    // duplicados (Anti-24 CLAUDE.md §8.1).
    const rows = await client.$queryRaw<{ ultimoNumero: number }[]>`
      INSERT INTO secuencias_comprobante (
        "organizationId", tipo, year, month, "ultimoNumero", "updatedAt"
      )
      VALUES (
        ${tenantId},
        ${tipo}::"TipoComprobante",
        ${year}::int,
        ${month}::int,
        1,
        now()
      )
      ON CONFLICT ("organizationId", tipo, year, month) DO UPDATE SET
        "ultimoNumero" = secuencias_comprobante."ultimoNumero" + 1,
        "updatedAt"    = now()
      RETURNING "ultimoNumero" AS "ultimoNumero"
    `;

    if (rows.length !== 1 || rows[0] === undefined) {
      throw new Error(
        `SecuenciaComprobante: upsert no devolvió fila para (${tenantId}, ${tipo}, ${year}-${month})`,
      );
    }
    return rows[0].ultimoNumero;
  }
}
