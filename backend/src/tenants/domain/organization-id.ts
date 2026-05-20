import { OrganizationIdInvalidoError } from './tenant-errors';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Identificador de una organización (tenant). UUID generado por Prisma
 * en `Organization.id`. Se usa como `tenantId` en todas las queries
 * scopeadas por tenant (CLAUDE.md §4.2).
 */
export class OrganizationId {
  private constructor(private readonly value: string) {}

  static of(raw: string): OrganizationId {
    if (typeof raw !== 'string' || !UUID_REGEX.test(raw)) {
      throw new OrganizationIdInvalidoError(raw);
    }
    return new OrganizationId(raw.toLowerCase());
  }

  toString(): string {
    return this.value;
  }

  equals(other: OrganizationId): boolean {
    return this.value === other.value;
  }
}
