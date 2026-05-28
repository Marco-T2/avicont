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
  // El cast a Parameters<typeof selector>[0] evita tener que reproducir el shape
  // completo de AuthState (acciones del store, etc.) — solo nos importa que el
  // selector pueda leer `user.roles`.
  mockUseAuthStore.mockImplementation((selector) => {
    const state = { user: roles !== undefined ? { roles } : undefined };
    return selector(state as Parameters<typeof selector>[0]);
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
