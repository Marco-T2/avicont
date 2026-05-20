import { MembershipId } from './membership-id';
import { MembershipIdInvalidoError } from './membership-errors';

describe('MembershipId', () => {
  const UUID_V4 = '550e8400-e29b-41d4-a716-446655440000';

  describe('of — válidos', () => {
    it('acepta UUID canónico', () => {
      expect(() => MembershipId.of(UUID_V4)).not.toThrow();
    });

    it('normaliza a lowercase', () => {
      const id = MembershipId.of(UUID_V4.toUpperCase());
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
      expect(() => MembershipId.of(raw)).toThrow(MembershipIdInvalidoError);
    });

    it('rechaza tipos no-string', () => {
      expect(() => MembershipId.of(null as unknown as string)).toThrow(MembershipIdInvalidoError);
      expect(() => MembershipId.of(undefined as unknown as string)).toThrow(
        MembershipIdInvalidoError,
      );
      expect(() => MembershipId.of(42 as unknown as string)).toThrow(MembershipIdInvalidoError);
    });
  });

  describe('equals', () => {
    it('true si mismo valor normalizado', () => {
      const a = MembershipId.of(UUID_V4);
      const b = MembershipId.of(UUID_V4.toUpperCase());
      expect(a.equals(b)).toBe(true);
    });

    it('false si distintos', () => {
      const a = MembershipId.of(UUID_V4);
      const b = MembershipId.of('11111111-2222-4333-8444-555555555555');
      expect(a.equals(b)).toBe(false);
    });
  });
});
