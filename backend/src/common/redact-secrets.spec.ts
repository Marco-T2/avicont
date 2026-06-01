import { redactarSensibles } from './redact-secrets';

describe('redactarSensibles', () => {
  it('redacta claves sensibles en minúsculas', () => {
    const result = redactarSensibles({ password: 'p', token: 't', authorization: 'Bearer x' });
    expect(result).toEqual({
      password: '[REDACTED]',
      token: '[REDACTED]',
      authorization: '[REDACTED]',
    });
  });

  it('redacta claves sensibles en camelCase (case-insensitive)', () => {
    // Regresión: el set guardaba estas claves en camelCase pero el lookup
    // bajaba a minúsculas, así que nunca matcheaban. Deben redactarse.
    const result = redactarSensibles({
      hashedPassword: 'h',
      accessToken: 'a',
      refreshToken: 'r',
      apiKey: 'k',
      privateKey: 'pk',
      clientSecret: 'cs',
    });
    expect(result).toEqual({
      hashedPassword: '[REDACTED]',
      accessToken: '[REDACTED]',
      refreshToken: '[REDACTED]',
      apiKey: '[REDACTED]',
      privateKey: '[REDACTED]',
      clientSecret: '[REDACTED]',
    });
  });

  it('redacta claves sensibles en snake_case', () => {
    const result = redactarSensibles({ api_key: 'k', private_key: 'pk', client_secret: 'cs' });
    expect(result).toEqual({
      api_key: '[REDACTED]',
      private_key: '[REDACTED]',
      client_secret: '[REDACTED]',
    });
  });

  it('preserva campos no sensibles', () => {
    const result = redactarSensibles({ name: 'Acme', plan: 'PRO', password: 'p' });
    expect(result).toEqual({ name: 'Acme', plan: 'PRO', password: '[REDACTED]' });
  });

  it('no muta el objeto original', () => {
    const original = { password: 'p', name: 'Acme' };
    redactarSensibles(original);
    expect(original).toEqual({ password: 'p', name: 'Acme' });
  });

  it('retorna objeto vacío para entradas no-objeto', () => {
    expect(redactarSensibles(null)).toEqual({});
    expect(redactarSensibles(undefined)).toEqual({});
    expect(redactarSensibles('string')).toEqual({});
    expect(redactarSensibles([1, 2, 3])).toEqual({});
  });
});
