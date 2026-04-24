import { ImpersonationWindowInvalidaError } from './impersonation-errors';

// TTL default de una sesión de impersonation (CLAUDE.md §5.6 "JWT dedicado
// 30 min"). Las cotas superior e inferior son defensas del VO contra usos
// erróneos si en el futuro se parametriza por config.
const DEFAULT_MINUTES = 30;
const MIN_MINUTES = 1;
const MAX_MINUTES = 8 * 60;

/**
 * Ventana temporal de vida de un JWT de impersonation. Inmutable.
 *
 * - `expiresAt(from)` calcula el `Date` de expiración desde un instante dado.
 * - `toExpiresIn()` retorna el formato que acepta `JwtService.sign({ expiresIn })`
 *   (`"30m"` por ejemplo).
 *
 * Centralizar el TTL acá evita tener constantes `IMPERSONATION_TTL_MIN`
 * replicadas en service, tests y docs.
 */
export class ImpersonationWindow {
  private constructor(private readonly minutes: number) {}

  static default(): ImpersonationWindow {
    return new ImpersonationWindow(DEFAULT_MINUTES);
  }

  static ofMinutes(minutes: number): ImpersonationWindow {
    if (!Number.isInteger(minutes)) {
      throw new ImpersonationWindowInvalidaError('minutes debe ser entero', {
        minutes,
      });
    }
    if (minutes < MIN_MINUTES) {
      throw new ImpersonationWindowInvalidaError(
        `minutes debe ser >= ${MIN_MINUTES}`,
        { minutes },
      );
    }
    if (minutes > MAX_MINUTES) {
      throw new ImpersonationWindowInvalidaError(
        `minutes debe ser <= ${MAX_MINUTES}`,
        { minutes },
      );
    }
    return new ImpersonationWindow(minutes);
  }

  durationMinutes(): number {
    return this.minutes;
  }

  toExpiresIn(): `${number}m` {
    return `${this.minutes}m`;
  }

  expiresAt(from: Date): Date {
    return new Date(from.getTime() + this.minutes * 60 * 1000);
  }

  equals(other: ImpersonationWindow): boolean {
    return this.minutes === other.minutes;
  }
}
