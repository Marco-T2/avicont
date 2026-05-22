import { Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import {
  TIPO_DOCUMENTO_FISICO_REPOSITORY_PORT,
  TipoDocumentoFisicoRepositoryPort,
} from '../ports/tipo-documento-fisico.repository.port';
import { TipoDocumentoFisicoSeederPort } from '../ports/tipos-documento-fisico-seeder.port';
import { TIPOS_UNIVERSALES } from '../seed/tipos-universales';

@Injectable()
export class PrismaTiposDocumentoFisicoSeederAdapter extends TipoDocumentoFisicoSeederPort {
  constructor(
    @Inject(TIPO_DOCUMENTO_FISICO_REPOSITORY_PORT)
    private readonly repo: TipoDocumentoFisicoRepositoryPort,
  ) {
    super();
  }

  override async seedDefaultsForTenant(
    tenantId: string,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    // Copia mutable: TIPOS_UNIVERSALES es readonly (inmutable hacia afuera),
    // upsertSeed recibe un array mutable.
    await this.repo.upsertSeed(tenantId, [...TIPOS_UNIVERSALES], tx);
  }
}
