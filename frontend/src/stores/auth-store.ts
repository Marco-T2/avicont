import { create } from 'zustand';

import type { JwtPayload } from '@/types/api';

export interface AuthUser {
  id: string;
  email: string;
  activeTenantId?: string;
  roles: string[];
}

interface AuthState {
  accessToken: string | null;
  user: AuthUser | null;
  /** true mientras se verifica la sesión al arranque (refresh automático). */
  bootstrapping: boolean;
  setToken: (token: string | null) => void;
  setBootstrapping: (b: boolean) => void;
  clear: () => void;
}

// El accessToken vive SOLO en memoria (ver CLAUDE.md §10.10 — mover a
// localStorage es inseguro para un sistema contable; el refreshToken en
// cookie httpOnly lo recupera al reload vía /api/auth/refresh).
export const useAuthStore = create<AuthState>((set) => ({
  accessToken: null,
  user: null,
  bootstrapping: true,
  setToken: (token) => {
    if (token === null) {
      set({ accessToken: null, user: null });
      return;
    }
    const payload = decodeJwt(token);
    const user: AuthUser | null = payload
      ? {
          id: payload.sub,
          email: payload.email,
          ...(payload.activeTenantId !== undefined
            ? { activeTenantId: payload.activeTenantId }
            : {}),
          roles: payload.roles ?? [],
        }
      : null;
    set({ accessToken: token, user });
  },
  setBootstrapping: (b) => set({ bootstrapping: b }),
  clear: () => set({ accessToken: null, user: null }),
}));

// Decodifica el payload del JWT SIN validar la firma — el frontend solo lo
// usa para mostrar `email` y `roles` en la UI. La validación real la hace
// el backend en cada request.
function decodeJwt(token: string): JwtPayload | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3 || parts[1] === undefined) return null;
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    const json = atob(padded);
    return JSON.parse(json) as JwtPayload;
  } catch {
    return null;
  }
}
