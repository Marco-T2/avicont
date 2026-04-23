/**
 * Base abstract para todos los errores de dominio del sistema. Cada subclase
 * fija su propio `httpStatus`; el caller pasa un `code` estable siguiendo la
 * convención `{MODULO}_{SUBDOMINIO}_{CONDICION}` (ver CLAUDE.md §6.3).
 *
 * El `code` es parte del contrato público hacia el cliente — una vez publicado
 * no cambia aunque el `message` cambie. Clientes lo usan para identificar el
 * error sin parsear strings.
 *
 * `details` es opcional y lleva contexto útil (sin datos sensibles) que el
 * cliente puede renderizar al usuario. Ej: `{ totalDebito: "1000.00", diff: "50.00" }`.
 */
export abstract class DomainError extends Error {
  abstract readonly httpStatus: number;
  readonly code: string;
  readonly details?: Record<string, unknown>;

  constructor(code: string, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    if (details !== undefined) {
      this.details = details;
    }
    // Necesario para que `instanceof` funcione al cruzar el boundary de
    // transpilación de TypeScript a ES5/ES6 con target bajo.
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
