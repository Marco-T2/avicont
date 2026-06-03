import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const navigateMock = vi.fn();
const clearMock = vi.fn();
const apiPostMock = vi.fn().mockResolvedValue({});
const broadcastLogoutMock = vi.fn();
const toastSuccessMock = vi.fn();

vi.mock('react-router-dom', () => ({
  useNavigate: () => navigateMock,
}));

vi.mock('@/lib/api', () => ({
  api: { post: (...args: unknown[]) => apiPostMock(...args) },
}));

vi.mock('@/lib/auth-channel', () => ({
  broadcastLogout: () => broadcastLogoutMock(),
}));

vi.mock('sonner', () => ({
  toast: { success: (...args: unknown[]) => toastSuccessMock(...args) },
}));

vi.mock('@/stores/auth-store', () => ({
  useAuthStore: (selector: (s: { clear: () => void }) => unknown) => selector({ clear: clearMock }),
}));

import { useLogout } from './use-logout';

afterEach(() => {
  vi.clearAllMocks();
});

describe('useLogout', () => {
  it('cierra sesión: backend + clear + broadcast a otras pestañas + navega a /login', async () => {
    const { result } = renderHook(() => useLogout());
    await result.current();

    expect(apiPostMock).toHaveBeenCalledWith('/api/auth/logout');
    expect(clearMock).toHaveBeenCalledTimes(1);
    expect(broadcastLogoutMock).toHaveBeenCalledTimes(1);
    expect(navigateMock).toHaveBeenCalledWith('/login', { replace: true });
  });

  it('si el backend falla, igual limpia en memoria, avisa a otras pestañas y navega', async () => {
    apiPostMock.mockRejectedValueOnce(new Error('network'));
    const { result } = renderHook(() => useLogout());
    await result.current();

    expect(clearMock).toHaveBeenCalledTimes(1);
    expect(broadcastLogoutMock).toHaveBeenCalledTimes(1);
    expect(navigateMock).toHaveBeenCalledWith('/login', { replace: true });
  });
});
