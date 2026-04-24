import { EmailInvalidoError } from './user-errors';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_LONGITUD = 254;

export class Email {
  private constructor(private readonly value: string) {}

  static of(raw: string): Email {
    if (typeof raw !== 'string') {
      throw new EmailInvalidoError(raw, 'se esperaba string');
    }
    const normalizado = raw.trim().toLowerCase();
    if (normalizado.length === 0) {
      throw new EmailInvalidoError(raw, 'no puede estar vacío');
    }
    if (normalizado.length > MAX_LONGITUD) {
      throw new EmailInvalidoError(
        raw,
        `excede longitud máxima de ${MAX_LONGITUD} caracteres`,
      );
    }
    if (!EMAIL_REGEX.test(normalizado)) {
      throw new EmailInvalidoError(raw, 'formato no válido');
    }
    return new Email(normalizado);
  }

  toString(): string {
    return this.value;
  }

  equals(other: Email): boolean {
    return this.value === other.value;
  }
}
