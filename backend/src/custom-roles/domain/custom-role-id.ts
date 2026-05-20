import { CustomRoleIdInvalidoError } from './custom-role-errors';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class CustomRoleId {
  private constructor(private readonly value: string) {}

  static of(raw: string): CustomRoleId {
    if (typeof raw !== 'string' || !UUID_REGEX.test(raw)) {
      throw new CustomRoleIdInvalidoError(raw);
    }
    return new CustomRoleId(raw.toLowerCase());
  }

  toString(): string {
    return this.value;
  }

  equals(other: CustomRoleId): boolean {
    return this.value === other.value;
  }
}
