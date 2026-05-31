import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';

import type { AssignableRole } from '@/types/api';

// Mock del api function — controla la data en tests sin red real.
const mockGetAssignableRoles = vi.fn();
vi.mock('../api/get-assignable-roles', () => ({
  getAssignableRoles: (...args: unknown[]) => mockGetAssignableRoles(...args),
}));

import { useAssignableRoles } from './use-assignable-roles';

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client: qc }, children);
  };
}

describe('useAssignableRoles', () => {
  it('con open: false — la query está deshabilitada y no dispara request', () => {
    const { result } = renderHook(() => useAssignableRoles(false), {
      wrapper: makeWrapper(),
    });

    expect(mockGetAssignableRoles).not.toHaveBeenCalled();
    // fetchStatus 'idle' cuando disabled; isLoading es false.
    expect(result.current.isLoading).toBe(false);
  });

  it('con open: true — la query se habilita y devuelve los roles', async () => {
    const rolesData: AssignableRole[] = [
      { id: 'ADMIN', name: 'Administrador', kind: 'system', description: 'Todos los permisos' },
      { id: 'uuid-1', name: 'Contador', kind: 'custom' },
    ];
    mockGetAssignableRoles.mockResolvedValue(rolesData);

    const { result } = renderHook(() => useAssignableRoles(true), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(mockGetAssignableRoles).toHaveBeenCalledTimes(1);
    expect(result.current.data).toEqual(rolesData);
  });

  it('con open: true — la queryKey incluye memberships y assignable-roles', async () => {
    const rolesData: AssignableRole[] = [];
    mockGetAssignableRoles.mockResolvedValue(rolesData);

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(QueryClientProvider, { client: qc }, children);

    renderHook(() => useAssignableRoles(true), { wrapper });

    await waitFor(() => {
      const cache = qc.getQueryCache().findAll();
      const keys = cache.map((q) => q.queryKey);
      expect(keys).toContainEqual(['memberships', 'assignable-roles']);
    });
  });
});
