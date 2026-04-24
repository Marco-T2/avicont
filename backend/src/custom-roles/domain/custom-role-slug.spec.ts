import { CustomRoleSlug } from './custom-role-slug';
import { CustomRoleSlugInvalidoError } from './custom-role-errors';

describe('CustomRoleSlug', () => {
  describe('of — válidos', () => {
    it.each([
      'co',
      'cobrador',
      'cobrador-aux',
      'granjero-turno-noche',
      'rol-2',
      'v2',
    ])('acepta "%s"', (raw) => {
      expect(() => CustomRoleSlug.of(raw)).not.toThrow();
    });

    it('trimea espacios antes de validar', () => {
      const s = CustomRoleSlug.of('  contador  ');
      expect(s.toString()).toBe('contador');
    });
  });

  describe('of — inválidos', () => {
    it.each([
      ['', 'vacío'],
      ['a', 'muy corto'],
      ['Contador', 'mayúsculas'],
      ['cobrador_aux', 'underscore no permitido'],
      ['cobrador aux', 'espacio'],
      ['-cobrador', 'empieza con guión'],
      ['cobrador-', 'termina en guión'],
      ['cobrador--aux', 'guión doble'],
      ['a'.repeat(51), 'supera 50 chars'],
    ])('rechaza "%s" (%s)', (raw) => {
      expect(() => CustomRoleSlug.of(raw)).toThrow(CustomRoleSlugInvalidoError);
    });

    it('rechaza tipos no-string', () => {
      expect(() => CustomRoleSlug.of(null as unknown as string)).toThrow(
        CustomRoleSlugInvalidoError,
      );
      expect(() => CustomRoleSlug.of(undefined as unknown as string)).toThrow(
        CustomRoleSlugInvalidoError,
      );
      expect(() => CustomRoleSlug.of(42 as unknown as string)).toThrow(
        CustomRoleSlugInvalidoError,
      );
    });
  });

  describe('equals', () => {
    it('true si mismo valor', () => {
      expect(
        CustomRoleSlug.of('cobrador-aux').equals(
          CustomRoleSlug.of('cobrador-aux'),
        ),
      ).toBe(true);
    });

    it('false si distintos', () => {
      expect(
        CustomRoleSlug.of('cobrador').equals(CustomRoleSlug.of('contador')),
      ).toBe(false);
    });
  });
});
