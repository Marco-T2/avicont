/**
 * Campos sensibles que se redactan antes de persistir o loguear payloads.
 * CLAUDE.md §6.7: passwords/tokens/secrets/authorization → `[REDACTED]`.
 */
// Claves guardadas en minúsculas: el lookup compara con `key.toLowerCase()`,
// así el match es case-insensitive y cubre camelCase (accessToken) y
// snake_case (access_token) por igual.
const SENSITIVE_KEYS = new Set([
  'password',
  'hashedpassword',
  'token',
  'accesstoken',
  'refreshtoken',
  'secret',
  'authorization',
  'apikey',
  'api_key',
  'privatekey',
  'private_key',
  'clientsecret',
  'client_secret',
]);

/**
 * Redacta campos sensibles de un objeto plano (un nivel de profundidad).
 * Retorna un objeto nuevo; nunca muta el original.
 *
 * Solo aplica al nivel raíz — para bodies HTTP simples eso es suficiente.
 * Si el futuro exige recursión, ampliar acá.
 */
export function redactarSensibles(body: unknown): Record<string, unknown> {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return {};
  }

  const input = body as Record<string, unknown>;
  const result: Record<string, unknown> = {};

  for (const key of Object.keys(input)) {
    result[key] = SENSITIVE_KEYS.has(key.toLowerCase()) ? '[REDACTED]' : input[key];
  }

  return result;
}
