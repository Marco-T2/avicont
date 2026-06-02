import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { FeatureFlag } from '@/types/api';

import { useUpdateFeatureFlag } from './use-update-feature-flag';

vi.mock('../api/update-feature-flag', () => ({
  updateFeatureFlag: vi.fn(),
}));

import { updateFeatureFlag } from '../api/update-feature-flag';

const FLAG: FeatureFlag = {
  id: 'ff-1',
  key: 'new_dashboard',
  name: 'New Dashboard V2',
  description: 'Actualizado',
  enabled: true,
  organizationId: null,
  metadata: null,
  createdAt: '2026-06-02T10:00:00Z',
  updatedAt: '2026-06-02T11:00:00Z',
};

function makeWrapper(qc: QueryClient): (props: { children: React.ReactNode }) => React.JSX.Element {
  return ({ children }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe('useUpdateFeatureFlag', () => {
  beforeEach(() => {
    vi.mocked(updateFeatureFlag).mockReset();
  });

  it('al actualizar con éxito invalida el catálogo de feature flags', async () => {
    vi.mocked(updateFeatureFlag).mockResolvedValue(FLAG);
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries');

    const { result } = renderHook(() => useUpdateFeatureFlag(), { wrapper: makeWrapper(qc) });

    result.current.mutate({ key: 'new_dashboard', body: { name: 'New Dashboard V2' } });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(updateFeatureFlag).toHaveBeenCalledWith('new_dashboard', { name: 'New Dashboard V2' });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['feature-flags-global'] });
  });

  it('ante un 404 de key inexistente queda en error y NO invalida', async () => {
    vi.mocked(updateFeatureFlag).mockRejectedValue({
      response: {
        status: 404,
        data: {
          code: 'FEATURE_FLAG_NO_ENCONTRADA',
          message: 'La feature flag global "fantasma" no existe',
        },
      },
    });
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries');

    const { result } = renderHook(() => useUpdateFeatureFlag(), { wrapper: makeWrapper(qc) });

    result.current.mutate({ key: 'fantasma', body: { name: 'X' } });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(invalidateSpy).not.toHaveBeenCalled();
  });
});
