import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { PlatformOrg } from '@/types/api';

import { useCreateOrg } from './use-create-org';

vi.mock('../api/create-org', () => ({
  createOrg: vi.fn(),
}));

import { createOrg } from '../api/create-org';

const ORG: PlatformOrg = {
  id: 'org-9',
  name: 'Nueva Avícola',
  slug: 'nueva-avicola',
  status: 'ACTIVE',
  plan: 'FREE',
  contabilidadEnabled: true,
  granjaEnabled: false,
  createdAt: '2026-06-02T10:00:00Z',
};

function makeWrapper(qc: QueryClient): (props: { children: React.ReactNode }) => React.JSX.Element {
  return ({ children }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

describe('useCreateOrg', () => {
  beforeEach(() => {
    vi.mocked(createOrg).mockReset();
  });

  it('al crear con éxito invalida la lista de organizaciones', async () => {
    vi.mocked(createOrg).mockResolvedValue(ORG);
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries');

    const { result } = renderHook(() => useCreateOrg(), { wrapper: makeWrapper(qc) });

    result.current.mutate({
      name: 'Nueva Avícola',
      modulo: 'CONTABILIDAD',
      ownerEmail: 'owner@example.com',
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(createOrg).toHaveBeenCalledWith({
      name: 'Nueva Avícola',
      modulo: 'CONTABILIDAD',
      ownerEmail: 'owner@example.com',
    });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['platform-orgs'] });
  });

  it('ante un error 422 (ownerEmail inexistente) queda en estado de error', async () => {
    vi.mocked(createOrg).mockRejectedValue({
      response: {
        status: 422,
        data: {
          code: 'PLATFORM_ORG_OWNER_NOT_FOUND',
          message: 'No existe ningún usuario registrado con el email: ghost@example.com',
        },
      },
    });
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries');

    const { result } = renderHook(() => useCreateOrg(), { wrapper: makeWrapper(qc) });

    result.current.mutate({
      name: 'Org sin owner',
      modulo: 'CONTABILIDAD',
      ownerEmail: 'ghost@example.com',
    });

    await waitFor(() => expect(result.current.isError).toBe(true));

    // En error NO se invalida la lista (no se creó nada).
    expect(invalidateSpy).not.toHaveBeenCalled();
  });
});
