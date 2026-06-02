import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { FeatureFlag } from '@/types/api';

import { useCreateFeatureFlag } from './use-create-feature-flag';

vi.mock('../api/create-feature-flag', () => ({
  createFeatureFlag: vi.fn(),
}));

import { createFeatureFlag } from '../api/create-feature-flag';

const FLAG: FeatureFlag = {
  id: 'ff-1',
  key: 'new_dashboard',
  name: 'New Dashboard',
  description: null,
  enabled: false,
  organizationId: null,
  metadata: null,
  createdAt: '2026-06-02T10:00:00Z',
  updatedAt: '2026-06-02T10:00:00Z',
};

function makeWrapper(qc: QueryClient): (props: { children: React.ReactNode }) => React.JSX.Element {
  return ({ children }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe('useCreateFeatureFlag', () => {
  beforeEach(() => {
    vi.mocked(createFeatureFlag).mockReset();
  });

  it('al crear con éxito invalida el catálogo de feature flags', async () => {
    vi.mocked(createFeatureFlag).mockResolvedValue(FLAG);
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries');

    const { result } = renderHook(() => useCreateFeatureFlag(), { wrapper: makeWrapper(qc) });

    result.current.mutate({ key: 'new_dashboard', name: 'New Dashboard', enabled: false });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(createFeatureFlag).toHaveBeenCalledWith({
      key: 'new_dashboard',
      name: 'New Dashboard',
      enabled: false,
    });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['feature-flags-global'] });
  });

  it('ante un 409 de key duplicada queda en error y NO invalida', async () => {
    vi.mocked(createFeatureFlag).mockRejectedValue({
      response: {
        status: 409,
        data: {
          code: 'FEATURE_FLAG_DUPLICADA',
          message: 'Ya existe una feature flag global "new_dashboard"',
        },
      },
    });
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries');

    const { result } = renderHook(() => useCreateFeatureFlag(), { wrapper: makeWrapper(qc) });

    result.current.mutate({ key: 'new_dashboard', name: 'New Dashboard' });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(invalidateSpy).not.toHaveBeenCalled();
  });
});
