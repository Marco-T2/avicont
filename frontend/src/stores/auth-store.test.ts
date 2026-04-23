import { beforeEach, describe, expect, it } from 'vitest';

import { useAuthStore } from './auth-store';

// Token JWT válido estructuralmente (firma dummy) con payload:
// { sub: 'u1', email: 'u@e2e.bo', roles: ['OWNER'], activeTenantId: 't1', iat: 0, exp: 9999999999 }
const FAKE_TOKEN =
  'eyJhbGciOiJIUzI1NiJ9.' +
  btoa(
    JSON.stringify({
      sub: 'u1',
      email: 'u@e2e.bo',
      roles: ['OWNER'],
      activeTenantId: 't1',
      iat: 0,
      exp: 9999999999,
    }),
  )
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_') +
  '.sig';

describe('auth-store', () => {
  beforeEach(() => {
    useAuthStore.getState().clear();
  });

  it('setToken decodea el JWT y pobla el user con email y roles', () => {
    useAuthStore.getState().setToken(FAKE_TOKEN);
    const { accessToken, user } = useAuthStore.getState();
    expect(accessToken).toBe(FAKE_TOKEN);
    expect(user).toEqual({
      id: 'u1',
      email: 'u@e2e.bo',
      activeTenantId: 't1',
      roles: ['OWNER'],
    });
  });

  it('setToken(null) limpia el token y el user', () => {
    useAuthStore.getState().setToken(FAKE_TOKEN);
    useAuthStore.getState().setToken(null);
    const { accessToken, user } = useAuthStore.getState();
    expect(accessToken).toBeNull();
    expect(user).toBeNull();
  });

  it('setToken con JWT malformado deja el user en null pero guarda el string', () => {
    useAuthStore.getState().setToken('not.a.jwt');
    expect(useAuthStore.getState().user).toBeNull();
  });

  it('clear() resetea todo', () => {
    useAuthStore.getState().setToken(FAKE_TOKEN);
    useAuthStore.getState().clear();
    expect(useAuthStore.getState().accessToken).toBeNull();
    expect(useAuthStore.getState().user).toBeNull();
  });
});
