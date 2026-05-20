import { CustomRoleId } from './custom-role-id';
import { CustomRoleIdInvalidoError } from './custom-role-errors';

describe('CustomRoleId', () => {
  const UUID_V4 = '550e8400-e29b-41d4-a716-446655440000';

  describe('of — válidos', () => {
    it('acepta UUID canónico', () => {
      expect(() => CustomRoleId.of(UUID_V4)).not.toThrow();
    });

    it('normaliza a lowercase', () => {
      const id = CustomRoleId.of(UUID_V4.toUpperCase());
      expect(id.toString()).toBe(UUID_V4);
    });
  });

  describe('of — inválidos', () => {
    it.each([
      ['', 'vacío'],
      ['not-uuid', 'formato arbitrario'],
      ['550e8400-e29b-41d4-a716', 'truncado'],
      ['xxxxxxxx-e29b-41d4-a716-446655440000', 'caracteres no hex'],
    ])('rechaza "%s" (%s)', (raw) => {
      expect(() => CustomRoleId.of(raw)).toThrow(CustomRoleIdInvalidoError);
    });

    it('rechaza tipos no-string', () => {
      expect(() => CustomRoleId.of(null as unknown as string)).toThrow(CustomRoleIdInvalidoError);
      expect(() => CustomRoleId.of(undefined as unknown as string)).toThrow(
        CustomRoleIdInvalidoError,
      );
    });
  });

  describe('equals', () => {
    it('true si mismo valor normalizado', () => {
      const a = CustomRoleId.of(UUID_V4);
      const b = CustomRoleId.of(UUID_V4.toUpperCase());
      expect(a.equals(b)).toBe(true);
    });

    it('false si distintos', () => {
      const a = CustomRoleId.of(UUID_V4);
      const b = CustomRoleId.of('11111111-2222-4333-8444-555555555555');
      expect(a.equals(b)).toBe(false);
    });
  });
});
