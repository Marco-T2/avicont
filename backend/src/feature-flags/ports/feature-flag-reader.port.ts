// Port cross-módulo DEFINIDO por feature-flags (dueño del dominio,
// CLAUDE.md §3.7) para LECTURAS del estado efectivo de una flag.
// Superficie mínima — es lo que van a consumir granja (Fase 2) y el
// FeatureFlagGuard (hoy sin callers, preparado para @RequireFeature).
//
// Resolución efectiva:
//   tenant-override > flag global > false
//
// El reader es ADEMÁS el dueño del caching de lectura del módulo. El
// service NO toca cache directo: después de cada mutación contra la BD
// llama `invalidate(...)` para que la próxima lectura re-popule desde
// la fuente de verdad. Esto garantiza un único dueño del cache y evita
// drift entre rutas de lectura/escritura.
//
// Regla de concurrencia: la invalidación se hace SIEMPRE post-commit a
// la BD. Si el mutate falla, el cache queda consistente; si el
// invalidate falla (Redis caído), el peor caso es cache stale hasta el
// TTL — nunca rompe el flujo de negocio del service.

export const FEATURE_FLAG_READER_PORT = Symbol('FEATURE_FLAG_READER_PORT');

export abstract class FeatureFlagReaderPort {
  /**
   * Estado efectivo de una flag para un tenant. `organizationId`
   * opcional: si se omite se consulta sólo la flag global.
   * Retorna `false` si la flag no existe en ningún nivel.
   */
  abstract isEnabled(key: string, organizationId?: string): Promise<boolean>;

  /**
   * Snapshot de todas las flags aplicables a un tenant con su estado
   * efectivo resuelto (override > global). Usado por el endpoint
   * `GET /feature-flags` y futuros consumers que quieran precargar el
   * catálogo.
   */
  abstract getAllForTenant(organizationId: string): Promise<Record<string, boolean>>;

  /**
   * Invalida las entradas de cache asociadas a la clave `key` de un
   * tenant — tanto la entrada puntual como el bucket "all" que
   * precachea `getAllForTenant`. El service llama a este método
   * después de commitear una mutación (create / update / toggle /
   * delete) para que la próxima lectura re-popule.
   */
  abstract invalidate(organizationId: string, key: string): Promise<void>;
}
