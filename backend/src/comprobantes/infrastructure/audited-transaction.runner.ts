import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '@/common/prisma.service';

export interface AuditedTxOpts {
  /** Usuario que ejecuta la operación. OBLIGATORIO — lanzar si vacío. */
  userId: string;
  /** Motivo opcional, para anular / editar contabilizados. */
  motivo?: string;
  /** Id de la reapertura activa si la TX corre dentro de una. */
  reaperturaId?: string;
}

/**
 * Envuelve prisma.$transaction para inyectar el contexto de auditoría via
 * SET LOCAL (set_config con is_local=true). Los triggers de Postgres leen
 * estas session vars en current_setting y populan comprobantes_audit con
 * el actor correcto.
 *
 * Los valores son válidos SOLO dentro de la TX: set_config(..., true) los
 * descarta automáticamente al COMMIT o ROLLBACK — no escapan la sesión.
 *
 * Toda operación que emita eventos de auditoría DEBE usar este wrapper.
 * Un prisma.$transaction directo en el módulo comprobantes deja user_id=NULL
 * en comprobantes_audit, lo cual es un bug de auditoría.
 */
@Injectable()
export class AuditedTransactionRunner {
  constructor(private readonly prisma: PrismaService) {}

  async run<T>(opts: AuditedTxOpts, fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    if (!opts.userId) {
      throw new Error('AuditedTransactionRunner: userId is required');
    }

    return this.prisma.$transaction(async (tx) => {
      // Postgres no acepta parámetros bind en SET, pero set_config() sí.
      // is_local=true descarta el valor al final de la TX (equivale a SET LOCAL).
      await tx.$executeRaw`SELECT set_config('app.audit_user_id', ${opts.userId}, true)`;
      await tx.$executeRaw`SELECT set_config('app.audit_motivo', ${opts.motivo ?? ''}, true)`;
      await tx.$executeRaw`SELECT set_config('app.audit_reapertura_id', ${opts.reaperturaId ?? ''}, true)`;
      await tx.$executeRaw`SELECT set_config('app.audit_during_reopening', ${opts.reaperturaId ? 'true' : 'false'}, true)`;

      return fn(tx);
    });
  }
}
