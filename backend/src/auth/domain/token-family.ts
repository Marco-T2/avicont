import * as crypto from 'crypto';

import { TokenFamilyInvalidaError } from './auth-errors';

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * Identificador de familia de refresh tokens. Todos los tokens emitidos en
 * una misma cadena login→rotaciones comparten el mismo familyId; al detectar
 * reuso se revoca la familia entera (CLAUDE.md §5.3).
 */
export class TokenFamily {
  private constructor(private readonly value: string) {}

  static of(raw: string): TokenFamily {
    if (typeof raw !== 'string') {
      throw new TokenFamilyInvalidaError('se esperaba string');
    }
    const normalizado = raw.toLowerCase();
    if (!UUID_REGEX.test(normalizado)) {
      throw new TokenFamilyInvalidaError('se esperaba un UUID');
    }
    return new TokenFamily(normalizado);
  }

  static generate(): TokenFamily {
    return new TokenFamily(crypto.randomUUID());
  }

  toString(): string {
    return this.value;
  }

  equals(other: TokenFamily): boolean {
    return this.value === other.value;
  }
}
