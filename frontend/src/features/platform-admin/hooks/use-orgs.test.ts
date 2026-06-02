import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';

import type { PlatformOrg } from '@/types/api';

// Mock del api function — controla la data en tests sin red real.
const mockGetOrgs = vi.fn();
vi.mock('../api/get-orgs', () => ({
  getOrgs: (...args: unknown[]) => mockGetOrgs(...args),
}));

import { useOrgs } from './use-orgs';

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client: qc }, children);
  };
}

describe('useOrgs', () => {
  it('en éxito devuelve la lista de organizaciones', async () => {
    const orgs: PlatformOrg[] = [
      {
        id: 'org-1',
        name: 'Avícola del Valle',
        slug: 'avicola-del-valle',
        status: 'ACTIVE',
        plan: 'PRO',
        contabilidadEnabled: true,
        granjaEnabled: false,
        createdAt: '2026-01-01T00:00:00Z',
      },
    ];
    mockGetOrgs.mockResolvedValue(orgs);

    const { result } = renderHook(() => useOrgs(), { wrapper: makeWrapper() });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(mockGetOrgs).toHaveBeenCalledTimes(1);
    expect(result.current.data).toEqual(orgs);
  });

  it('usa la queryKey ["platform-orgs"]', async () => {
    mockGetOrgs.mockResolvedValue([]);

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(QueryClientProvider, { client: qc }, children);

    renderHook(() => useOrgs(), { wrapper });

    await waitFor(() => {
      const keys = qc.getQueryCache().findAll().map((q) => q.queryKey);
      expect(keys).toContainEqual(['platform-orgs']);
    });
  });

  it('en error expone isError sin romper', async () => {
    mockGetOrgs.mockRejectedValue(new Error('boom'));

    const { result } = renderHook(() => useOrgs(), { wrapper: makeWrapper() });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.data).toBeUndefined();
  });
});
