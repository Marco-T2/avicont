import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';

import { usePuedeEditarContabilizado } from './use-puede-editar-contabilizado';

// Mock the auth store so we can control user roles in each test.
vi.mock('@/stores/auth-store', () => ({
  useAuthStore: vi.fn(),
}));

import { useAuthStore } from '@/stores/auth-store';

const mockUseAuthStore = vi.mocked(useAuthStore);

function setupRoles(roles: string[] | undefined) {
  // useAuthStore is called with a selector fn: (s) => s.user?.roles
  // We need to simulate: mockUseAuthStore returns the result of the selector.
  mockUseAuthStore.mockImplementation((selector: (s: unknown) => unknown) => {
    const state = { user: roles !== undefined ? { roles } : undefined };
    return (selector as (s: typeof state) => unknown)(state);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('usePuedeEditarContabilizado', () => {
  it('devuelve true para usuario OWNER', () => {
    setupRoles(['OWNER']);
    const { result } = renderHook(() => usePuedeEditarContabilizado());
    expect(result.current).toBe(true);
  });

  it('devuelve true para usuario ADMIN', () => {
    setupRoles(['ADMIN']);
    const { result } = renderHook(() => usePuedeEditarContabilizado());
    expect(result.current).toBe(true);
  });

  it('devuelve false para CustomRole sin SystemRole', () => {
    setupRoles(['contador']);
    const { result } = renderHook(() => usePuedeEditarContabilizado());
    expect(result.current).toBe(false);
  });
});
