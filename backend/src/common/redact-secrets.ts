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
 * Recorre un valor arbitrario redactando claves sensibles a cualquier
 * profundidad. Retorna copias nuevas de objetos y arrays; nunca muta el
 * original. `seen` traza el camino actual para cortar ciclos.
 */
function redactarValor(value: unknown, seen: WeakSet<object>): unknown {
  if (value === null || typeof value !== 'object') {
    return value;
  }
  if (seen.has(value)) {
    return '[CIRCULAR]';
  }

  seen.add(value);
  try {
    if (Array.isArray(value)) {
      return value.map((item) => redactarValor(item, seen));
    }

    const input = value as Record<string, unknown>;
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(input)) {
      result[key] = SENSITIVE_KEYS.has(key.toLowerCase())
        ? '[REDACTED]'
        : redactarValor(input[key], seen);
    }
    return result;
  } finally {
    // Backtracking: una referencia compartida no-cíclica (DAG) se procesa
    // dos veces, pero un ciclo real sí queda cortado por el `seen.has` de arriba.
    seen.delete(value);
  }
}

/**
 * Redacta campos sensibles de un body recursivamente (sub-objetos y objetos
 * dentro de arrays incluidos). Retorna un objeto nuevo; nunca muta el original.
 *
 * El nivel raíz debe ser un objeto plano (los bodies HTTP siempre lo son):
 * un body null/array/primitivo se descarta a `{}`.
 */
export function redactarSensibles(body: unknown): Record<string, unknown> {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return {};
  }

  return redactarValor(body, new WeakSet()) as Record<string, unknown>;
}
