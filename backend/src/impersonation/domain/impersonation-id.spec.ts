import { ImpersonationId } from './impersonation-id';
import { ImpersonationIdInvalidoError } from './impersonation-errors';

describe('ImpersonationId', () => {
  const UUID_V4 = '550e8400-e29b-41d4-a716-446655440000';

  describe('of — válidos', () => {
    it('acepta UUID canónico', () => {
      expect(() => ImpersonationId.of(UUID_V4)).not.toThrow();
    });

    it('normaliza a lowercase', () => {
      const id = ImpersonationId.of(UUID_V4.toUpperCase());
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
      expect(() => ImpersonationId.of(raw)).toThrow(ImpersonationIdInvalidoError);
    });

    it('rechaza tipos no-string', () => {
      expect(() => ImpersonationId.of(null as unknown as string)).toThrow(
        ImpersonationIdInvalidoError,
      );
      expect(() => ImpersonationId.of(undefined as unknown as string)).toThrow(
        ImpersonationIdInvalidoError,
      );
    });
  });

  describe('equals', () => {
    it('true si mismo valor normalizado', () => {
      const a = ImpersonationId.of(UUID_V4);
      const b = ImpersonationId.of(UUID_V4.toUpperCase());
      expect(a.equals(b)).toBe(true);
    });

    it('false si distintos', () => {
      const a = ImpersonationId.of(UUID_V4);
      const b = ImpersonationId.of('11111111-2222-4333-8444-555555555555');
      expect(a.equals(b)).toBe(false);
    });
  });
});
