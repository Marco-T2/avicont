import { TenantSlug } from './tenant-slug';
import { TenantSlugInvalidoError } from './tenant-errors';

describe('TenantSlug', () => {
  describe('of — válidos', () => {
    it.each([
      'a',
      'acme',
      'acme-corp',
      'granja-norte-1',
      'avicultor1',
      '1nombre',
    ])('acepta "%s"', (raw) => {
      expect(() => TenantSlug.of(raw)).not.toThrow();
    });

    it('preserva el valor', () => {
      expect(TenantSlug.of('acme-corp').toString()).toBe('acme-corp');
    });

    it('hace trim antes de validar', () => {
      expect(TenantSlug.of('  acme-corp  ').toString()).toBe('acme-corp');
    });
  });

  describe('of — inválidos', () => {
    it.each([
      ['', 'vacío'],
      ['   ', 'sólo espacios'],
      ['Acme', 'mayúsculas'],
      ['acme corp', 'espacio interno'],
      ['-acme', 'guion al inicio'],
      ['acme-', 'guion al final'],
      ['acme--corp', 'guiones dobles'],
      ['acme_corp', 'guion bajo'],
      ['acmé', 'diacrítico'],
      ['a'.repeat(101), 'excede 100 caracteres'],
    ])('rechaza "%s" (%s)', (raw) => {
      expect(() => TenantSlug.of(raw)).toThrow(TenantSlugInvalidoError);
    });

    it('rechaza tipos no-string', () => {
      expect(() => TenantSlug.of(null as unknown as string)).toThrow(
        TenantSlugInvalidoError,
      );
      expect(() => TenantSlug.of(123 as unknown as string)).toThrow(
        TenantSlugInvalidoError,
      );
    });
  });

  describe('fromName — derivación', () => {
    it.each([
      ['Acme Corp', 'acme-corp'],
      ['Granja Norte', 'granja-norte'],
      ['  Acme  ', 'acme'],
      ['Acme!!!', 'acme'],
      ['José Martínez', 'jose-martinez'],
      ['Niño Bueno', 'nino-bueno'],
      ['Avicultor 123', 'avicultor-123'],
      ['Múltiples   espacios', 'multiples-espacios'],
      ['---Acme---', 'acme'],
    ])('"%s" → "%s"', (name, expected) => {
      expect(TenantSlug.fromName(name).toString()).toBe(expected);
    });

    it.each([
      ['', 'cadena vacía'],
      ['   ', 'sólo espacios'],
      ['!!!', 'sólo símbolos'],
      ['---', 'sólo guiones'],
    ])('rechaza "%s" (%s) — quedaría vacío', (name) => {
      expect(() => TenantSlug.fromName(name)).toThrow(TenantSlugInvalidoError);
    });

    it('rechaza tipos no-string', () => {
      expect(() => TenantSlug.fromName(null as unknown as string)).toThrow(
        TenantSlugInvalidoError,
      );
    });
  });

  describe('equals', () => {
    it('true si mismo valor', () => {
      const a = TenantSlug.of('acme-corp');
      const b = TenantSlug.of('acme-corp');
      expect(a.equals(b)).toBe(true);
    });

    it('false si distintos', () => {
      const a = TenantSlug.of('acme-corp');
      const b = TenantSlug.of('acme-corp-2');
      expect(a.equals(b)).toBe(false);
    });
  });
});
