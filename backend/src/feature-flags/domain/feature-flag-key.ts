import { FeatureFlagKeyInvalidaError } from './feature-flag-errors';

const FEATURE_FLAG_KEY_REGEX = /^[a-z][a-z0-9_]*$/;
const MAX_LONGITUD = 100;

/**
 * Identificador de una feature flag. Formato: lowercase, empieza con letra,
 * sólo letras/dígitos/underscore. Máximo 100 caracteres.
 *
 * El DTO (`CreateFeatureFlagDto`) también valida este formato vía
 * class-validator para dar un 400 claro al cliente. Este VO actúa como
 * defense-in-depth en el service y garantiza que el repo/reader reciban
 * un valor ya normalizado.
 */
export class FeatureFlagKey {
  private constructor(private readonly value: string) {}

  static of(raw: unknown): FeatureFlagKey {
    if (typeof raw !== 'string') {
      throw new FeatureFlagKeyInvalidaError(raw, 'se esperaba string');
    }
    if (raw.length === 0) {
      throw new FeatureFlagKeyInvalidaError(raw, 'no puede estar vacía');
    }
    if (raw.length > MAX_LONGITUD) {
      throw new FeatureFlagKeyInvalidaError(
        raw,
        `excede longitud máxima de ${MAX_LONGITUD} caracteres`,
      );
    }
    if (!FEATURE_FLAG_KEY_REGEX.test(raw)) {
      throw new FeatureFlagKeyInvalidaError(
        raw,
        'debe empezar con letra minúscula y contener sólo letras, números o guión bajo',
      );
    }
    return new FeatureFlagKey(raw);
  }

  toString(): string {
    return this.value;
  }

  equals(other: FeatureFlagKey): boolean {
    return this.value === other.value;
  }
}
