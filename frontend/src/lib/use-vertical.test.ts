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

import { useVerticalActivo } from './use-vertical';

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

describe('useVerticalActivo', () => {
  it('devuelve GRANJA cuando la cache tiene vertical GRANJA', () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    seedCache(qc, 'tenant-1', {
      permissions: [],
      isOwner: false,
      activeTenantId: 'tenant-1',
      vertical: 'GRANJA',
      packsActivos: [],
    });
    const { result } = renderHook(() => useVerticalActivo(), {
      wrapper: makeWrapper(qc),
    });
    expect(result.current.vertical).toBe('GRANJA');
    expect(result.current.isLoading).toBe(false);
  });

  it('devuelve CONTABILIDAD cuando la cache tiene vertical CONTABILIDAD', () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    seedCache(qc, 'tenant-1', {
      permissions: [],
      isOwner: true,
      activeTenantId: 'tenant-1',
      vertical: 'CONTABILIDAD',
      packsActivos: [],
    });
    const { result } = renderHook(() => useVerticalActivo(), {
      wrapper: makeWrapper(qc),
    });
    expect(result.current.vertical).toBe('CONTABILIDAD');
  });

  it('devuelve null (no undefined) cuando la cache tiene vertical null', () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    seedCache(qc, 'tenant-1', {
      permissions: [],
      isOwner: false,
      activeTenantId: 'tenant-1',
      vertical: null,
      packsActivos: [],
    });
    const { result } = renderHook(() => useVerticalActivo(), {
      wrapper: makeWrapper(qc),
    });
    // null = org sin módulo (distinto de undefined = cargando)
    expect(result.current.vertical).toBeNull();
    expect(result.current.isLoading).toBe(false);
  });

  it('devuelve vertical undefined e isLoading true cuando la query está pending (sin cache)', () => {
    // El mock provee accessToken y activeTenantId → query enabled.
    // Sin cache seedeado, la query está en estado pending → isLoading true.
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    // NO seedeamos cache → query en pending → vertical undefined (fail-closed)
    const { result } = renderHook(() => useVerticalActivo(), {
      wrapper: makeWrapper(qc),
    });
    // La query está enabled y pending → vertical undefined + isLoading true
    expect(result.current.vertical).toBeUndefined();
    expect(result.current.isLoading).toBe(true);
  });

  it('usa el queryKey ["me-permissions", activeTenantId] — mismo que usePermissions', () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    // Seedeamos con la key exacta que debe usar el hook
    seedCache(qc, 'tenant-1', {
      permissions: [],
      isOwner: false,
      activeTenantId: 'tenant-1',
      vertical: 'GRANJA',
      packsActivos: [],
    });
    const { result } = renderHook(() => useVerticalActivo(), {
      wrapper: makeWrapper(qc),
    });
    // Si usa la key correcta, lee los datos del cache sin HTTP
    expect(result.current.vertical).toBe('GRANJA');
  });
});
