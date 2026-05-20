import { TenantSlugInvalidoError } from './tenant-errors';

const MAX_LENGTH = 100;
const SLUG_REGEX = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/**
 * Slug único global de la organización (`Organization.slug`, UNIQUE en BD).
 * Kebab-case alfanumérico: `acme-corp`, `granja-norte`, `avicultor1`.
 * Caracteres permitidos: `a-z`, `0-9`, `-`. No empieza ni termina en `-`,
 * no permite guiones dobles, no admite mayúsculas ni espacios.
 *
 * Se deriva del `name` con `fromName(...)`. La derivación falla si el name
 * no produce caracteres alfanuméricos (e.g. `"!!!"`) — antes el sistema
 * generaba slug vacío y el segundo intento chocaba con la UNIQUE.
 */
export class TenantSlug {
  private constructor(private readonly value: string) {}

  static of(raw: string): TenantSlug {
    if (typeof raw !== 'string') {
      throw new TenantSlugInvalidoError('se esperaba un string', { raw });
    }
    const trimmed = raw.trim();
    if (trimmed.length === 0) {
      throw new TenantSlugInvalidoError('no puede estar vacío');
    }
    if (trimmed.length > MAX_LENGTH) {
      throw new TenantSlugInvalidoError(`no puede superar los ${MAX_LENGTH} caracteres`, { raw });
    }
    if (!SLUG_REGEX.test(trimmed)) {
      throw new TenantSlugInvalidoError(
        'debe ser kebab-case alfanumérico (minúsculas, dígitos y guiones simples)',
        { raw },
      );
    }
    return new TenantSlug(trimmed);
  }

  /**
   * Deriva un slug válido a partir de un nombre humano. Aplica NFKD para
   * que `"José"` quede `"jose"` y no pierda la `e`. Falla si el nombre
   * no contiene ningún carácter alfanumérico tras la normalización
   * (e.g. `"!!!"`, `"   "`).
   */
  static fromName(name: string): TenantSlug {
    if (typeof name !== 'string') {
      throw new TenantSlugInvalidoError('nombre debe ser string', { raw: name });
    }
    const slugified = name
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    return TenantSlug.of(slugified);
  }

  toString(): string {
    return this.value;
  }

  equals(other: TenantSlug): boolean {
    return this.value === other.value;
  }
}
