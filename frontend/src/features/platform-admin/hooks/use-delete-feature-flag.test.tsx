import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useDeleteFeatureFlag } from './use-delete-feature-flag';

vi.mock('../api/delete-feature-flag', () => ({
  deleteFeatureFlag: vi.fn(),
}));

import { deleteFeatureFlag } from '../api/delete-feature-flag';

function makeWrapper(qc: QueryClient): (props: { children: React.ReactNode }) => React.JSX.Element {
  return ({ children }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe('useDeleteFeatureFlag', () => {
  beforeEach(() => {
    vi.mocked(deleteFeatureFlag).mockReset();
  });

  it('al eliminar con éxito invalida el catálogo de feature flags', async () => {
    vi.mocked(deleteFeatureFlag).mockResolvedValue();
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries');

    const { result } = renderHook(() => useDeleteFeatureFlag(), { wrapper: makeWrapper(qc) });

    result.current.mutate('new_dashboard');

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(deleteFeatureFlag).toHaveBeenCalledWith('new_dashboard');
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['feature-flags-global'] });
  });

  it('ante un 404 queda en error y NO invalida', async () => {
    vi.mocked(deleteFeatureFlag).mockRejectedValue({
      response: { status: 404, data: { code: 'FEATURE_FLAG_NO_ENCONTRADA', message: 'No existe' } },
    });
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries');

    const { result } = renderHook(() => useDeleteFeatureFlag(), { wrapper: makeWrapper(qc) });

    result.current.mutate('fantasma');

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(invalidateSpy).not.toHaveBeenCalled();
  });
});
