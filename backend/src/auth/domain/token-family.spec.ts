import { TokenFamily } from './token-family';
import { TokenFamilyInvalidaError } from './auth-errors';

describe('TokenFamily', () => {
  describe('of — válidos', () => {
    it('acepta UUID v4 canónico', () => {
      expect(() =>
        TokenFamily.of('123e4567-e89b-42d3-a456-426614174000'),
      ).not.toThrow();
    });

    it('normaliza uppercase a lowercase', () => {
      const f = TokenFamily.of('123E4567-E89B-42D3-A456-426614174000');
      expect(f.toString()).toBe('123e4567-e89b-42d3-a456-426614174000');
    });
  });

  describe('of — inválidos', () => {
    it.each([
      ['not-a-uuid', 'texto libre'],
      ['12345', 'muy corto'],
      ['123e4567-e89b-42d3-a456', 'incompleto'],
      ['123e4567e89b42d3a456426614174000', 'sin guiones'],
    ])('rechaza "%s" (%s)', (raw) => {
      expect(() => TokenFamily.of(raw)).toThrow(TokenFamilyInvalidaError);
    });

    it('rechaza string vacío', () => {
      expect(() => TokenFamily.of('')).toThrow(TokenFamilyInvalidaError);
    });

    it('rechaza tipos no-string', () => {
      expect(() => TokenFamily.of(null as unknown as string)).toThrow(
        TokenFamilyInvalidaError,
      );
    });
  });

  describe('generate', () => {
    it('produce UUID válido', () => {
      const f = TokenFamily.generate();
      expect(f.toString()).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
    });

    it('dos llamadas producen familias distintas', () => {
      const a = TokenFamily.generate();
      const b = TokenFamily.generate();
      expect(a.equals(b)).toBe(false);
    });
  });

  describe('equals', () => {
    it('true si valor normalizado coincide', () => {
      const a = TokenFamily.of('123E4567-E89B-42D3-A456-426614174000');
      const b = TokenFamily.of('123e4567-e89b-42d3-a456-426614174000');
      expect(a.equals(b)).toBe(true);
    });
  });
});
