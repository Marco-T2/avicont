import { DisplayNameInvalidoError } from './user-errors';

export const MAX_LONGITUD_DISPLAY_NAME = 100;

export class DisplayName {
  private constructor(private readonly value: string) {}

  static of(raw: string): DisplayName {
    if (typeof raw !== 'string') {
      throw new DisplayNameInvalidoError('se esperaba string', { raw });
    }
    const normalizado = raw.trim();
    if (normalizado.length === 0) {
      throw new DisplayNameInvalidoError('no puede estar vacío');
    }
    if (normalizado.length > MAX_LONGITUD_DISPLAY_NAME) {
      throw new DisplayNameInvalidoError(
        `excede longitud máxima de ${MAX_LONGITUD_DISPLAY_NAME} caracteres`,
        { longitudRecibida: normalizado.length, longitudMaxima: MAX_LONGITUD_DISPLAY_NAME },
      );
    }
    return new DisplayName(normalizado);
  }

  toString(): string {
    return this.value;
  }

  equals(other: DisplayName): boolean {
    return this.value === other.value;
  }
}
