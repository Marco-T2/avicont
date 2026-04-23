import axios, { AxiosError, type AxiosRequestConfig } from 'axios';

import { useAuthStore } from '@/stores/auth-store';

// Cliente Axios único del frontend.
// - baseURL vacío: aprovecha el proxy de Vite (/api → backend) en dev, y
//   asume mismo origin en prod (Nginx/Caddy). Same-origin hace que la cookie
//   httpOnly (refreshToken; Path=/api/auth) viaje naturalmente.
// - withCredentials:true fuerza que el navegador envíe/reciba cookies en
//   las requests; necesario incluso same-origin si en algún momento
//   el dev-server y el backend quedan en orígenes distintos.
export const api = axios.create({
  withCredentials: true,
});

// Request interceptor: adjunta el access token en memoria.
api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken;
  if (token !== null) {
    config.headers = config.headers ?? {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Deduplicación del refresh: si hay varios 401 simultáneos, todos esperan
// la MISMA promesa de refresh. Evita dispararlo N veces y rotar la cookie
// antes de que el backend marque el token viejo como revocado (lo que
// dispararía la detección de reuso y cerraría la familia).
let refreshInFlight: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  if (refreshInFlight !== null) return refreshInFlight;
  refreshInFlight = (async () => {
    try {
      const res = await axios.post<{ accessToken: string }>(
        '/api/auth/refresh',
        {},
        { withCredentials: true },
      );
      useAuthStore.getState().setToken(res.data.accessToken);
      return res.data.accessToken;
    } catch {
      useAuthStore.getState().clear();
      return null;
    } finally {
      // Limpiar en el próximo tick para que los retries concurrentes agarren
      // el nuevo token antes de que se resetee el flag.
      setTimeout(() => {
        refreshInFlight = null;
      }, 0);
    }
  })();
  return refreshInFlight;
}

interface RetriableConfig extends AxiosRequestConfig {
  _retried?: boolean;
}

// Response interceptor: 401 en endpoint distinto a /refresh/login/logout
// → intenta refresh una sola vez y reintenta la request original.
api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const status = error.response?.status;
    const original = error.config as RetriableConfig | undefined;

    if (
      status !== 401 ||
      original === undefined ||
      original._retried === true ||
      isAuthEndpoint(original.url)
    ) {
      return Promise.reject(error);
    }

    original._retried = true;
    const newToken = await refreshAccessToken();
    if (newToken === null) {
      return Promise.reject(error);
    }
    original.headers = original.headers ?? {};
    (original.headers as Record<string, string>).Authorization = `Bearer ${newToken}`;
    return api.request(original);
  },
);

function isAuthEndpoint(url: string | undefined): boolean {
  if (url === undefined) return false;
  return (
    url.includes('/api/auth/login') ||
    url.includes('/api/auth/refresh') ||
    url.includes('/api/auth/logout') ||
    url.includes('/api/auth/register')
  );
}

/**
 * Llamar en el bootstrap del app: intenta refrescar la sesión desde la
 * cookie httpOnly. Si hay sesión activa repone el accessToken en memoria;
 * si no (cookie ausente/expirada), deja el store limpio.
 */
export async function bootstrapAuth(): Promise<void> {
  const { setBootstrapping } = useAuthStore.getState();
  setBootstrapping(true);
  await refreshAccessToken();
  setBootstrapping(false);
}
