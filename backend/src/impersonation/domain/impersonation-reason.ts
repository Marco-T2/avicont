import { ImpersonationReasonInvalidaError } from './impersonation-errors';

// Mismo mínimo que el DTO (StartImpersonationDto @MinLength(10)).
// Centralizamos la regla acá para que haya UNA sola fuente de verdad — el DTO
// puede seguir declarando @IsString/@MinLength como filtro HTTP rápido, pero
// la semántica vive en el VO. Llamadores no-HTTP (jobs, CLIs, tests) pasan
// por el VO y obtienen la misma validación.
const MIN_LENGTH = 10;
const MAX_LENGTH = 500;

/**
 * Razón documentada de una sesión de impersonation. Queda en el log permanente
 * y es campo auditado — CLAUDE.md §5.6.
 */
export class ImpersonationReason {
  private constructor(private readonly value: string) {}

  static of(raw: string): ImpersonationReason {
    if (typeof raw !== 'string') {
      throw new ImpersonationReasonInvalidaError('se esperaba un string', { raw });
    }
    const trimmed = raw.trim();
    if (trimmed.length < MIN_LENGTH) {
      throw new ImpersonationReasonInvalidaError(`debe tener al menos ${MIN_LENGTH} caracteres`, {
        raw,
      });
    }
    if (trimmed.length > MAX_LENGTH) {
      throw new ImpersonationReasonInvalidaError(`no puede superar los ${MAX_LENGTH} caracteres`, {
        raw,
      });
    }
    return new ImpersonationReason(trimmed);
  }

  toString(): string {
    return this.value;
  }

  equals(other: ImpersonationReason): boolean {
    return this.value === other.value;
  }
}
