import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import { PrismaService } from '@/common/prisma.service';

import { SecuenciaDocumentoFisicoPort } from '../ports/secuencia-documento-fisico.port';

@Injectable()
export class PrismaSecuenciaDocumentoFisicoAdapter extends SecuenciaDocumentoFisicoPort {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async siguienteNumero(
    tenantId: string,
    tipoDocumentoFisicoId: string,
    numeroInicial: number,
    tx?: Prisma.TransactionClient,
  ): Promise<number> {
    const client = tx ?? this.prisma;

    // Statement único atómico: inserta con ultimoNumero=numeroInicial si no existe
    // la fila (primer documento del tipo → devuelve exactamente numeroInicial),
    // o incrementa el existente en 1 si ya existe. Postgres serializa writers
    // concurrentes sobre el mismo (organizationId, tipoDocumentoFisicoId) por el
    // row-lock implícito del UNIQUE constraint (PK compuesta).
    //
    // Diferencia vs SecuenciaComprobante: sin year/month en PK (secuencia continua,
    // no reinicia por mes) y valor inicial parametrizado en vez de 1 fijo.
    //
    // El output es el nuevo valor — garantizado consecutivo, sin gaps ni duplicados.
    // §4.9 CLAUDE.md, Anti-24, cicatriz VOUCHER_NUMBER_CONTENTION.
    const rows = await client.$queryRaw<{ ultimoNumero: number }[]>`
      INSERT INTO secuencias_documento_fisico (
        "organizationId", "tipoDocumentoFisicoId", "ultimoNumero", "updatedAt"
      )
      VALUES (
        ${tenantId},
        ${tipoDocumentoFisicoId},
        ${numeroInicial}::int,
        now()
      )
      ON CONFLICT ("organizationId", "tipoDocumentoFisicoId") DO UPDATE SET
        "ultimoNumero" = secuencias_documento_fisico."ultimoNumero" + 1,
        "updatedAt"    = now()
      RETURNING "ultimoNumero" AS "ultimoNumero"
    `;

    if (rows.length !== 1 || rows[0] === undefined) {
      throw new Error(
        `SecuenciaDocumentoFisico: upsert no devolvió fila para (${tenantId}, ${tipoDocumentoFisicoId})`,
      );
    }
    return rows[0].ultimoNumero;
  }
}
