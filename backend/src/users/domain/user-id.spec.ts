import { UserId } from './user-id';
import { UserIdInvalidoError } from './user-errors';

describe('UserId', () => {
  const UUID_V4 = '550e8400-e29b-41d4-a716-446655440000';

  describe('of — válidos', () => {
    it('acepta UUID canónico', () => {
      expect(() => UserId.of(UUID_V4)).not.toThrow();
    });

    it('normaliza a lowercase', () => {
      const id = UserId.of(UUID_V4.toUpperCase());
      expect(id.toString()).toBe(UUID_V4);
    });
  });

  describe('of — inválidos', () => {
    it.each([
      ['', 'vacío'],
      ['no-es-uuid', 'formato arbitrario'],
      ['550e8400-e29b-41d4-a716', 'truncado'],
      ['550e8400e29b41d4a716446655440000', 'sin guiones'],
      ['xxxxxxxx-e29b-41d4-a716-446655440000', 'caracteres no hex'],
    ])('rechaza "%s" (%s)', (raw) => {
      expect(() => UserId.of(raw)).toThrow(UserIdInvalidoError);
    });

    it('rechaza tipos no-string', () => {
      expect(() => UserId.of(null as unknown as string)).toThrow(UserIdInvalidoError);
      expect(() => UserId.of(undefined as unknown as string)).toThrow(UserIdInvalidoError);
      expect(() => UserId.of(42 as unknown as string)).toThrow(UserIdInvalidoError);
    });
  });

  describe('equals', () => {
    it('true si mismo valor normalizado', () => {
      const a = UserId.of(UUID_V4);
      const b = UserId.of(UUID_V4.toUpperCase());
      expect(a.equals(b)).toBe(true);
    });

    it('false si distintos', () => {
      const a = UserId.of(UUID_V4);
      const b = UserId.of('11111111-2222-4333-8444-555555555555');
      expect(a.equals(b)).toBe(false);
    });
  });
});
