import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useAuthStore } from '@/stores/auth-store';

import { useHasSystemRole, usePuedeReabrir } from './use-permissions';

// Setea/limpia el user del store real (zustand expone setState).
// Cada test setea su user; afterEach lo limpia para evitar leak entre suites.
function withUser(roles: string[]): void {
  useAuthStore.setState({
    accessToken: 'fake-token',
    user: {
      id: 'u-1',
      email: 'test@avicont.bo',
      roles,
    },
  });
}

afterEach(() => {
  useAuthStore.setState({ accessToken: null, user: null });
  vi.clearAllMocks();
});

describe('useHasSystemRole', () => {
  it('devuelve true cuando el usuario tiene OWNER', () => {
    withUser(['OWNER']);
    const { result } = renderHook(() => useHasSystemRole(['OWNER', 'ADMIN']));
    expect(result.current).toBe(true);
  });

  it('devuelve true cuando el usuario tiene ADMIN', () => {
    withUser(['ADMIN']);
    const { result } = renderHook(() => useHasSystemRole(['OWNER', 'ADMIN']));
    expect(result.current).toBe(true);
  });

  it('devuelve false con rol custom que no es OWNER ni ADMIN', () => {
    withUser(['CONTADOR_SENIOR']);
    const { result } = renderHook(() => useHasSystemRole(['OWNER', 'ADMIN']));
    expect(result.current).toBe(false);
  });

  it('devuelve false cuando se pide solo OWNER y el usuario es ADMIN', () => {
    withUser(['ADMIN']);
    const { result } = renderHook(() => useHasSystemRole(['OWNER']));
    expect(result.current).toBe(false);
  });

  it('devuelve false cuando no hay usuario', () => {
    useAuthStore.setState({ accessToken: null, user: null });
    const { result } = renderHook(() => useHasSystemRole(['OWNER', 'ADMIN']));
    expect(result.current).toBe(false);
  });

  it('soporta lista de roles vacía → false', () => {
    withUser(['OWNER']);
    const { result } = renderHook(() => useHasSystemRole([]));
    expect(result.current).toBe(false);
  });
});

describe('usePuedeReabrir', () => {
  it('OWNER puede reabrir', () => {
    withUser(['OWNER']);
    const { result } = renderHook(() => usePuedeReabrir());
    expect(result.current).toBe(true);
  });

  it('ADMIN puede reabrir', () => {
    withUser(['ADMIN']);
    const { result } = renderHook(() => usePuedeReabrir());
    expect(result.current).toBe(true);
  });

  it('CONTADOR custom NO puede reabrir', () => {
    withUser(['CONTADOR_SENIOR']);
    const { result } = renderHook(() => usePuedeReabrir());
    expect(result.current).toBe(false);
  });

  it('usuario sin sesión NO puede reabrir', () => {
    useAuthStore.setState({ accessToken: null, user: null });
    const { result } = renderHook(() => usePuedeReabrir());
    expect(result.current).toBe(false);
  });
});
