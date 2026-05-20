import { UserIdInvalidoError } from './user-errors';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class UserId {
  private constructor(private readonly value: string) {}

  static of(raw: string): UserId {
    if (typeof raw !== 'string' || !UUID_REGEX.test(raw)) {
      throw new UserIdInvalidoError(raw);
    }
    return new UserId(raw.toLowerCase());
  }

  toString(): string {
    return this.value;
  }

  equals(other: UserId): boolean {
    return this.value === other.value;
  }
}
