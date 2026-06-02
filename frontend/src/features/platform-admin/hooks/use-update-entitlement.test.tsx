import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { PlatformOrg } from '@/types/api';

import { useUpdateEntitlement } from './use-update-entitlement';

vi.mock('../api/update-entitlement', () => ({
  updateEntitlement: vi.fn(),
}));

import { updateEntitlement } from '../api/update-entitlement';

const ORG: PlatformOrg = {
  id: 'org-2',
  name: 'Avícola Pro',
  slug: 'avicola-pro',
  status: 'ACTIVE',
  plan: 'PRO',
  contabilidadEnabled: true,
  granjaEnabled: false,
  createdAt: '2026-06-02T10:00:00Z',
};

function makeWrapper(qc: QueryClient): (props: { children: React.ReactNode }) => React.JSX.Element {
  return ({ children }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe('useUpdateEntitlement', () => {
  beforeEach(() => {
    vi.mocked(updateEntitlement).mockReset();
  });

  it('al actualizar el entitlement con éxito invalida la lista de organizaciones', async () => {
    vi.mocked(updateEntitlement).mockResolvedValue(ORG);
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries');

    const { result } = renderHook(() => useUpdateEntitlement(), { wrapper: makeWrapper(qc) });

    result.current.mutate({
      id: 'org-2',
      body: { plan: 'PRO', contabilidadEnabled: true, granjaEnabled: false },
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(updateEntitlement).toHaveBeenCalledWith('org-2', {
      plan: 'PRO',
      contabilidadEnabled: true,
      granjaEnabled: false,
    });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['platform-orgs'] });
  });

  it('ante un 422 de exclusividad de verticales queda en error y NO invalida', async () => {
    vi.mocked(updateEntitlement).mockRejectedValue({
      response: {
        status: 422,
        data: {
          code: 'PLATFORM_VERTICAL_NO_EXCLUSIVO',
          message:
            'Una organización no puede tener más de un vertical activo a la vez (Contabilidad o Granja, no ambos)',
        },
      },
    });
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries');

    const { result } = renderHook(() => useUpdateEntitlement(), { wrapper: makeWrapper(qc) });

    result.current.mutate({
      id: 'org-2',
      body: { contabilidadEnabled: true, granjaEnabled: true },
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(invalidateSpy).not.toHaveBeenCalled();
  });
});
