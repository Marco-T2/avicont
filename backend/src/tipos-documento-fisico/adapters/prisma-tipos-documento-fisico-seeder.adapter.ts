import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import { TipoDocumentoFisicoRepositoryPort } from '../ports/tipo-documento-fisico.repository.port';
import { TipoDocumentoFisicoSeederPort } from '../ports/tipos-documento-fisico-seeder.port';
import { TIPOS_UNIVERSALES } from '../seed/tipos-universales';

@Injectable()
export class PrismaTiposDocumentoFisicoSeederAdapter extends TipoDocumentoFisicoSeederPort {
  constructor(private readonly repo: TipoDocumentoFisicoRepositoryPort) {
    super();
  }

  async seedDefaultsForTenant(tenantId: string, tx?: Prisma.TransactionClient): Promise<void> {
    // Copia mutable: TIPOS_UNIVERSALES es readonly (inmutable hacia afuera),
    // upsertSeed recibe un array mutable.
    await this.repo.upsertSeed(tenantId, [...TIPOS_UNIVERSALES], tx);
  }
}
