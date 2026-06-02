import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';
import { describe, expect, it, vi, afterEach } from 'vitest';

import type { MePermissionsResponse } from '@/types/api';

// Mock useAuthStore before importing the hook under test.
vi.mock('@/stores/auth-store', () => ({
  useAuthStore: vi.fn((selector: (s: unknown) => unknown) => {
    const fakeStore = {
      accessToken: 'fake-token',
      user: { activeTenantId: 'tenant-1' },
    };
    return selector(fakeStore);
  }),
}));

import { useMisPacks } from './use-packs';

function makeWrapper(qc: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return createElement(QueryClientProvider, { client: qc }, children);
  };
}

function seedCache(qc: QueryClient, tenantId: string, data: MePermissionsResponse) {
  qc.setQueryData(['me-permissions', tenantId], data);
}

afterEach(() => {
  vi.clearAllMocks();
});

describe('useMisPacks', () => {
  it('devuelve las claves de packs activos cuando la cache las tiene', () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    seedCache(qc, 'tenant-1', {
      permissions: [],
      isOwner: false,
      activeTenantId: 'tenant-1',
      vertical: 'CONTABILIDAD',
      packsActivos: ['contabilidad.adjuntos', 'contabilidad.rag'],
    });
    const { result } = renderHook(() => useMisPacks(), {
      wrapper: makeWrapper(qc),
    });
    expect(result.current.packsActivos).toEqual([
      'contabilidad.adjuntos',
      'contabilidad.rag',
    ]);
    expect(result.current.isLoading).toBe(false);
  });

  it('devuelve lista vacía cuando la org no tiene packs activos', () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    seedCache(qc, 'tenant-1', {
      permissions: [],
      isOwner: false,
      activeTenantId: 'tenant-1',
      vertical: 'CONTABILIDAD',
      packsActivos: [],
    });
    const { result } = renderHook(() => useMisPacks(), {
      wrapper: makeWrapper(qc),
    });
    expect(result.current.packsActivos).toEqual([]);
    expect(result.current.isLoading).toBe(false);
  });

  it('devuelve packsActivos undefined e isLoading true cuando la query está pending (sin cache)', () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    // Sin cache seedeado → query pending → packsActivos undefined (fail-closed).
    const { result } = renderHook(() => useMisPacks(), {
      wrapper: makeWrapper(qc),
    });
    expect(result.current.packsActivos).toBeUndefined();
    expect(result.current.isLoading).toBe(true);
  });

  it('usa el queryKey ["me-permissions", activeTenantId] — mismo que usePermissions', () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    seedCache(qc, 'tenant-1', {
      permissions: [],
      isOwner: false,
      activeTenantId: 'tenant-1',
      vertical: 'CONTABILIDAD',
      packsActivos: ['contabilidad.adjuntos'],
    });
    const { result } = renderHook(() => useMisPacks(), {
      wrapper: makeWrapper(qc),
    });
    // Si usa la key correcta, lee del cache sin HTTP extra.
    expect(result.current.packsActivos).toEqual(['contabilidad.adjuntos']);
  });
});
