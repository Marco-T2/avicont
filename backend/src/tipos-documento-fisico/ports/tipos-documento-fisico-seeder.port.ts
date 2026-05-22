// Port DEFINIDO por tipos-documento-fisico (dueño del catálogo, §3.7
// CLAUDE.md) para que `tenants` siembre los tipos universales al crear una
// organización (REQ-SEED-01..03, design §D3). Superficie mínima de un solo
// método: el módulo `tenants` queda ignorante del contenido del seed.

import type { Prisma } from '@prisma/client';

export const TIPO_DOCUMENTO_FISICO_SEEDER_PORT = Symbol('TIPO_DOCUMENTO_FISICO_SEEDER_PORT');

export abstract class TipoDocumentoFisicoSeederPort {
  /**
   * Siembra los 8 tipos universales en el tenant. Idempotente (upsert por
   * `(organizationId, codigo)`). `tx` es OBLIGATORIO: este seeder corre
   * dentro de la TX que crea la organización — el tenant nace listo (con los
   * 8 tipos) o no nace (atomicidad, design §D3).
   */
  abstract seedDefaultsForTenant(tenantId: string, tx: Prisma.TransactionClient): Promise<void>;
}
