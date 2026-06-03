import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const clearMock = vi.fn();
const toastInfoMock = vi.fn();
let capturedHandler: (() => void) | null = null;
let storeState: { accessToken: string | null; clear: () => void } = {
  accessToken: 'token-1',
  clear: clearMock,
};

vi.mock('./auth-channel', () => ({
  onLogoutFromOtherTab: (handler: () => void) => {
    capturedHandler = handler;
    return () => {
      capturedHandler = null;
    };
  },
}));

vi.mock('sonner', () => ({
  toast: { info: (...args: unknown[]) => toastInfoMock(...args) },
}));

vi.mock('@/stores/auth-store', () => ({
  useAuthStore: { getState: () => storeState },
}));

import { useAuthBroadcastSync } from './use-auth-broadcast-sync';

afterEach(() => {
  vi.clearAllMocks();
  capturedHandler = null;
  storeState = { accessToken: 'token-1', clear: clearMock };
});

describe('useAuthBroadcastSync', () => {
  it('logout en otra pestaña con sesión activa → limpia el store y avisa', () => {
    renderHook(() => useAuthBroadcastSync());
    expect(capturedHandler).not.toBeNull();

    capturedHandler?.();

    expect(clearMock).toHaveBeenCalledTimes(1);
    expect(toastInfoMock).toHaveBeenCalledTimes(1);
  });

  it('si esta pestaña ya estaba sin sesión → no hace nada (evita toast en /login)', () => {
    storeState = { accessToken: null, clear: clearMock };
    renderHook(() => useAuthBroadcastSync());

    capturedHandler?.();

    expect(clearMock).not.toHaveBeenCalled();
    expect(toastInfoMock).not.toHaveBeenCalled();
  });

  it('desmonta: se desuscribe', () => {
    const { unmount } = renderHook(() => useAuthBroadcastSync());
    expect(capturedHandler).not.toBeNull();

    unmount();

    expect(capturedHandler).toBeNull();
  });
});
