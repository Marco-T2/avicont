import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';

import type { PlatformOrgMember } from '@/types/api';

// Mock del api function — controla la data en tests sin red real.
const mockGetOrgMembers = vi.fn();
vi.mock('../api/get-org-members', () => ({
  getOrgMembers: (...args: unknown[]) => mockGetOrgMembers(...args),
}));

import { useOrgMembers } from './use-org-members';

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client: qc }, children);
  };
}

const members: PlatformOrgMember[] = [
  {
    id: 'mem-1',
    userId: 'user-1',
    systemRole: 'OWNER',
    customRoleId: null,
    customRole: null,
    deactivatedAt: null,
    createdAt: '2026-01-01T00:00:00Z',
    user: { id: 'user-1', email: 'owner@test.com', displayName: 'Propietario' },
  },
  {
    id: 'mem-2',
    userId: 'user-2',
    systemRole: 'ADMIN',
    customRoleId: null,
    customRole: null,
    deactivatedAt: '2026-03-01T00:00:00Z',
    createdAt: '2026-01-15T00:00:00Z',
    user: { id: 'user-2', email: 'admin@test.com', displayName: null },
  },
];

describe('useOrgMembers', () => {
  it('en éxito devuelve el array de miembros (activos + desactivados)', async () => {
    mockGetOrgMembers.mockResolvedValue(members);

    const { result } = renderHook(() => useOrgMembers('org-1'), { wrapper: makeWrapper() });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(mockGetOrgMembers).toHaveBeenCalledWith('org-1');
    expect(result.current.data).toEqual(members);
  });

  it('mientras carga expone isLoading: true', async () => {
    // Promesa que nunca resuelve para simular estado loading
    mockGetOrgMembers.mockReturnValue(new Promise(() => void 0));

    const { result } = renderHook(() => useOrgMembers('org-1'), { wrapper: makeWrapper() });

    expect(result.current.isLoading).toBe(true);
  });

  it('en error expone isError: true', async () => {
    mockGetOrgMembers.mockRejectedValue(new Error('boom'));

    const { result } = renderHook(() => useOrgMembers('org-1'), { wrapper: makeWrapper() });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.data).toBeUndefined();
  });

  it('usa la queryKey ["platform", "org-members", id]', async () => {
    mockGetOrgMembers.mockResolvedValue([]);

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(QueryClientProvider, { client: qc }, children);

    renderHook(() => useOrgMembers('org-1'), { wrapper });

    await waitFor(() => {
      const keys = qc.getQueryCache().findAll().map((q) => q.queryKey);
      expect(keys).toContainEqual(['platform', 'org-members', 'org-1']);
    });
  });
});
