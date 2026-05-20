import { CustomRoleSlugInvalidoError } from './custom-role-errors';

// Mismo rango/formato que el DTO (CreateCustomRoleDto @Length(2,50)
// @Matches(/^[a-z0-9]+(-[a-z0-9]+)*$/)). Centralizamos la regla acá para
// que haya UNA sola fuente de verdad — el DTO puede seguir declarando
// @IsString/@Length/@Matches como filtro de sintaxis rápido, pero la
// semántica vive en el VO.
const MIN_LENGTH = 2;
const MAX_LENGTH = 50;
const SLUG_REGEX = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/**
 * Slug único dentro de una organización. Kebab-case alfanumérico:
 * `cobrador-aux`, `contador`, `granjero-turno-noche`. Caracteres
 * permitidos: `a-z`, `0-9`, `-`. No empieza ni termina en `-`, no
 * permite guiones dobles ni mayúsculas.
 */
export class CustomRoleSlug {
  private constructor(private readonly value: string) {}

  static of(raw: string): CustomRoleSlug {
    if (typeof raw !== 'string') {
      throw new CustomRoleSlugInvalidoError('se esperaba un string', { raw });
    }
    const trimmed = raw.trim();
    if (trimmed.length < MIN_LENGTH) {
      throw new CustomRoleSlugInvalidoError(`debe tener al menos ${MIN_LENGTH} caracteres`, {
        raw,
      });
    }
    if (trimmed.length > MAX_LENGTH) {
      throw new CustomRoleSlugInvalidoError(`no puede superar los ${MAX_LENGTH} caracteres`, {
        raw,
      });
    }
    if (!SLUG_REGEX.test(trimmed)) {
      throw new CustomRoleSlugInvalidoError(
        'debe ser kebab-case alfanumérico (minúsculas, dígitos y guiones simples)',
        { raw },
      );
    }
    return new CustomRoleSlug(trimmed);
  }

  toString(): string {
    return this.value;
  }

  equals(other: CustomRoleSlug): boolean {
    return this.value === other.value;
  }
}
