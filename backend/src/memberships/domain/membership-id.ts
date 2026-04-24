import { MembershipIdInvalidoError } from './membership-errors';

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class MembershipId {
  private constructor(private readonly value: string) {}

  static of(raw: string): MembershipId {
    if (typeof raw !== 'string' || !UUID_REGEX.test(raw)) {
      throw new MembershipIdInvalidoError(raw);
    }
    return new MembershipId(raw.toLowerCase());
  }

  toString(): string {
    return this.value;
  }

  equals(other: MembershipId): boolean {
    return this.value === other.value;
  }
}
