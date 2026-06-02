import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { PlatformOrg } from '@/types/api';

import { useUpdateOrgStatus } from './use-update-org-status';

vi.mock('../api/update-org-status', () => ({
  updateOrgStatus: vi.fn(),
}));

import { updateOrgStatus } from '../api/update-org-status';

const ORG: PlatformOrg = {
  id: 'org-1',
  name: 'Avícola Test',
  slug: 'avicola-test',
  status: 'SUSPENDED',
  plan: 'FREE',
  contabilidadEnabled: true,
  granjaEnabled: false,
  createdAt: '2026-06-02T10:00:00Z',
};

function makeWrapper(qc: QueryClient): (props: { children: React.ReactNode }) => React.JSX.Element {
  return ({ children }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe('useUpdateOrgStatus', () => {
  beforeEach(() => {
    vi.mocked(updateOrgStatus).mockReset();
  });

  it('al cambiar el status con éxito invalida la lista de organizaciones', async () => {
    vi.mocked(updateOrgStatus).mockResolvedValue(ORG);
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries');

    const { result } = renderHook(() => useUpdateOrgStatus(), { wrapper: makeWrapper(qc) });

    result.current.mutate({ id: 'org-1', status: 'SUSPENDED' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(updateOrgStatus).toHaveBeenCalledWith('org-1', { status: 'SUSPENDED' });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['platform-orgs'] });
  });

  it('ante un error queda en estado de error y NO invalida', async () => {
    vi.mocked(updateOrgStatus).mockRejectedValue({
      response: { status: 404, data: { code: 'PLATFORM_ORG_NO_ENCONTRADA' } },
    });
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries');

    const { result } = renderHook(() => useUpdateOrgStatus(), { wrapper: makeWrapper(qc) });

    result.current.mutate({ id: 'org-1', status: 'ARCHIVED' });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(invalidateSpy).not.toHaveBeenCalled();
  });
});
