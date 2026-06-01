import type { Prisma } from '@prisma/client';

import type { TipoRegistroRepositoryPort } from '../ports/tipo-registro.repository.port';
import { TIPOS_REGISTRO_FABRICA } from '../seed/tipos-registro-fabrica';
import { PrismaTipoRegistroSeederAdapter } from './prisma-tipo-registro-seeder.adapter';

describe('PrismaTipoRegistroSeederAdapter', () => {
  it('seedDefaultsForTenant llama a upsertSeed con los 12 tipos de fábrica', async () => {
    const upsertSeed = jest.fn().mockResolvedValue(undefined);
    const repo = { upsertSeed } as unknown as TipoRegistroRepositoryPort;
    const seeder = new PrismaTipoRegistroSeederAdapter(repo);

    await seeder.seedDefaultsForTenant('org-1');

    expect(upsertSeed).toHaveBeenCalledTimes(1);
    expect(upsertSeed).toHaveBeenCalledWith('org-1', [...TIPOS_REGISTRO_FABRICA], undefined);
  });

  it('propaga tx cuando se pasa (participar de la TX de creación de org)', async () => {
    const upsertSeed = jest.fn().mockResolvedValue(undefined);
    const repo = { upsertSeed } as unknown as TipoRegistroRepositoryPort;
    const seeder = new PrismaTipoRegistroSeederAdapter(repo);
    const tx = {} as Prisma.TransactionClient;

    await seeder.seedDefaultsForTenant('org-2', tx);

    expect(upsertSeed).toHaveBeenCalledWith('org-2', [...TIPOS_REGISTRO_FABRICA], tx);
  });

  it('sin tx — llama a upsertSeed con undefined (para activación posterior)', async () => {
    const upsertSeed = jest.fn().mockResolvedValue(undefined);
    const repo = { upsertSeed } as unknown as TipoRegistroRepositoryPort;
    const seeder = new PrismaTipoRegistroSeederAdapter(repo);

    await seeder.seedDefaultsForTenant('org-3');

    expect(upsertSeed).toHaveBeenCalledWith('org-3', expect.any(Array), undefined);
  });
});
