import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useToggleFeatureFlag } from './use-toggle-feature-flag';

vi.mock('../api/toggle-feature-flag', () => ({
  toggleFeatureFlag: vi.fn(),
}));

import { toggleFeatureFlag } from '../api/toggle-feature-flag';

function makeWrapper(qc: QueryClient): (props: { children: React.ReactNode }) => React.JSX.Element {
  return ({ children }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe('useToggleFeatureFlag', () => {
  beforeEach(() => {
    vi.mocked(toggleFeatureFlag).mockReset();
  });

  it('al alternar con éxito invalida el catálogo de feature flags', async () => {
    vi.mocked(toggleFeatureFlag).mockResolvedValue({ key: 'new_dashboard', enabled: true });
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries');

    const { result } = renderHook(() => useToggleFeatureFlag(), { wrapper: makeWrapper(qc) });

    result.current.mutate('new_dashboard');

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(toggleFeatureFlag).toHaveBeenCalledWith('new_dashboard');
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['feature-flags-global'] });
  });

  it('ante un 404 queda en error y NO invalida', async () => {
    vi.mocked(toggleFeatureFlag).mockRejectedValue({
      response: { status: 404, data: { code: 'FEATURE_FLAG_NO_ENCONTRADA', message: 'No existe' } },
    });
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries');

    const { result } = renderHook(() => useToggleFeatureFlag(), { wrapper: makeWrapper(qc) });

    result.current.mutate('fantasma');

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(invalidateSpy).not.toHaveBeenCalled();
  });
});
