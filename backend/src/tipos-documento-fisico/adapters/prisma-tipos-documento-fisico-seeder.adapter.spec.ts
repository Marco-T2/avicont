import type { Prisma } from '@prisma/client';

import { TipoDocumentoFisicoRepositoryPort } from '../ports/tipo-documento-fisico.repository.port';
import { TIPOS_UNIVERSALES } from '../seed/tipos-universales';

import { PrismaTiposDocumentoFisicoSeederAdapter } from './prisma-tipos-documento-fisico-seeder.adapter';

describe('PrismaTiposDocumentoFisicoSeederAdapter', () => {
  it('siembra los 8 tipos universales vía upsertSeed', async () => {
    const upsertSeed = jest.fn().mockResolvedValue(undefined);
    const repo = { upsertSeed } as unknown as TipoDocumentoFisicoRepositoryPort;
    const seeder = new PrismaTiposDocumentoFisicoSeederAdapter(repo);
    const tx = {} as Prisma.TransactionClient;

    await seeder.seedDefaultsForTenant('org-1', tx);

    expect(upsertSeed).toHaveBeenCalledTimes(1);
    expect(upsertSeed).toHaveBeenCalledWith('org-1', [...TIPOS_UNIVERSALES], tx);
  });

  it('propaga el tx para participar de la transacción que crea el tenant', async () => {
    const upsertSeed = jest.fn().mockResolvedValue(undefined);
    const repo = { upsertSeed } as unknown as TipoDocumentoFisicoRepositoryPort;
    const seeder = new PrismaTiposDocumentoFisicoSeederAdapter(repo);
    const tx = {} as Prisma.TransactionClient;

    await seeder.seedDefaultsForTenant('org-1', tx);

    expect(upsertSeed).toHaveBeenCalledWith('org-1', [...TIPOS_UNIVERSALES], tx);
  });
});
