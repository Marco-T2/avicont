import * as crypto from 'crypto';

import { RefreshTokenHashInvalidoError } from './auth-errors';

const HEX64 = /^[0-9a-f]{64}$/;

/**
 * Hash SHA-256 de un refresh token. Invariante: exactamente 64 caracteres
 * hex lowercase. Nunca viaja el token crudo por la app — sólo su hash
 * (CLAUDE.md §5.3).
 */
export class RefreshTokenHash {
  private constructor(private readonly value: string) {}

  /**
   * Envuelve un hash ya computado. Lo normaliza a lowercase.
   */
  static of(raw: string): RefreshTokenHash {
    if (typeof raw !== 'string') {
      throw new RefreshTokenHashInvalidoError('se esperaba string');
    }
    const normalizado = raw.toLowerCase();
    if (!HEX64.test(normalizado)) {
      throw new RefreshTokenHashInvalidoError(
        'se esperaban 64 caracteres hex (SHA-256)',
      );
    }
    return new RefreshTokenHash(normalizado);
  }

  /**
   * Computa SHA-256 hex del token crudo.
   */
  static fromRaw(raw: string): RefreshTokenHash {
    const hash = crypto.createHash('sha256').update(raw).digest('hex');
    return new RefreshTokenHash(hash);
  }

  toString(): string {
    return this.value;
  }

  equals(other: RefreshTokenHash): boolean {
    return this.value === other.value;
  }
}
