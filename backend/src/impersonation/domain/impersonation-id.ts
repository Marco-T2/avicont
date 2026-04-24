import { ImpersonationIdInvalidoError } from './impersonation-errors';

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Identificador de una sesión de impersonation (UUID del `ImpersonationLog`).
 * Se propaga en el claim `impersonationId` del JWT de impersonation.
 */
export class ImpersonationId {
  private constructor(private readonly value: string) {}

  static of(raw: string): ImpersonationId {
    if (typeof raw !== 'string' || !UUID_REGEX.test(raw)) {
      throw new ImpersonationIdInvalidoError(raw);
    }
    return new ImpersonationId(raw.toLowerCase());
  }

  toString(): string {
    return this.value;
  }

  equals(other: ImpersonationId): boolean {
    return this.value === other.value;
  }
}
