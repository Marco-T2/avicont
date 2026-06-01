import { Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import {
  TIPO_REGISTRO_REPOSITORY_PORT,
  TipoRegistroRepositoryPort,
} from '../ports/tipo-registro.repository.port';
import { TipoRegistroSeederPort } from '../ports/tipo-registro-seeder.port';
import { TIPOS_REGISTRO_FABRICA } from '../seed/tipos-registro-fabrica';

/**
 * Adapter del TipoRegistroSeederPort.
 * Delega en TipoRegistroRepositoryPort.upsertSeed para sembrar los 12 tipos
 * de fábrica de forma idempotente por tenant.
 */
@Injectable()
export class PrismaTipoRegistroSeederAdapter extends TipoRegistroSeederPort {
  constructor(
    @Inject(TIPO_REGISTRO_REPOSITORY_PORT)
    private readonly repo: TipoRegistroRepositoryPort,
  ) {
    super();
  }

  override async seedDefaultsForTenant(
    organizationId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    // readonly → mutable spread para upsertSeed
    await this.repo.upsertSeed(organizationId, [...TIPOS_REGISTRO_FABRICA], tx);
  }
}
