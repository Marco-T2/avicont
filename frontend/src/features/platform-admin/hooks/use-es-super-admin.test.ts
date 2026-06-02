import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import React from 'react';

import * as authStoreModule from '@/stores/auth-store';

import * as getMePlatformModule from '../api/get-me-platform';
import { useEsSuperAdmin } from './use-es-super-admin';

function mockAccessToken(token: string | null) {
  type Selector = (s: { accessToken: string | null }) => unknown;
  vi.spyOn(authStoreModule, 'useAuthStore').mockImplementation(((selector: Selector) =>
    selector({ accessToken: token })) as typeof authStoreModule.useAuthStore);
}

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return React.createElement(QueryClientProvider, { client: qc }, children);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useEsSuperAdmin', () => {
  it('data { isSuperAdmin: true } → { esSuperAdmin: true, isLoading: false }', async () => {
    mockAccessToken('token');
    vi.spyOn(getMePlatformModule, 'getMePlatform').mockResolvedValue({ isSuperAdmin: true });

    const { result } = renderHook(() => useEsSuperAdmin(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.esSuperAdmin).toBe(true);
  });

  it('data { isSuperAdmin: false } → esSuperAdmin false', async () => {
    mockAccessToken('token');
    vi.spyOn(getMePlatformModule, 'getMePlatform').mockResolvedValue({ isSuperAdmin: false });

    const { result } = renderHook(() => useEsSuperAdmin(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.esSuperAdmin).toBe(false);
  });

  it('loading (sin data todavía) → esSuperAdmin false, isLoading true (fail-closed)', () => {
    mockAccessToken('token');
    vi.spyOn(getMePlatformModule, 'getMePlatform').mockImplementation(
      () => new Promise(() => {}),
    );

    const { result } = renderHook(() => useEsSuperAdmin(), { wrapper });

    expect(result.current.esSuperAdmin).toBe(false);
    expect(result.current.isLoading).toBe(true);
  });

  it('error / sin data → esSuperAdmin false', async () => {
    mockAccessToken('token');
    vi.spyOn(getMePlatformModule, 'getMePlatform').mockRejectedValue(new Error('boom'));

    const { result } = renderHook(() => useEsSuperAdmin(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.esSuperAdmin).toBe(false);
  });
});
