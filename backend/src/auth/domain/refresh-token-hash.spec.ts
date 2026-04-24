import { RefreshTokenHash } from './refresh-token-hash';
import { RefreshTokenHashInvalidoError } from './auth-errors';

describe('RefreshTokenHash', () => {
  const HEX64 = 'a'.repeat(64);

  describe('of — válidos', () => {
    it('acepta 64 chars hex lowercase', () => {
      expect(() => RefreshTokenHash.of(HEX64)).not.toThrow();
    });

    it('acepta mix hex real', () => {
      const hash = '3a7bd3e2360a3d5b4e0f19a3b1c0f6d2f87e35d6ab19cc7f18a0e2c4ff09b8d1';
      expect(() => RefreshTokenHash.of(hash)).not.toThrow();
    });

    it('normaliza hex uppercase a lowercase', () => {
      const hash = RefreshTokenHash.of('A'.repeat(64));
      expect(hash.toString()).toBe('a'.repeat(64));
    });
  });

  describe('of — inválidos', () => {
    it('rechaza menos de 64 chars', () => {
      expect(() => RefreshTokenHash.of('a'.repeat(63))).toThrow(
        RefreshTokenHashInvalidoError,
      );
    });

    it('rechaza más de 64 chars', () => {
      expect(() => RefreshTokenHash.of('a'.repeat(65))).toThrow(
        RefreshTokenHashInvalidoError,
      );
    });

    it('rechaza caracteres no-hex', () => {
      const casi = 'z'.repeat(64);
      expect(() => RefreshTokenHash.of(casi)).toThrow(RefreshTokenHashInvalidoError);
    });

    it('rechaza string vacío', () => {
      expect(() => RefreshTokenHash.of('')).toThrow(RefreshTokenHashInvalidoError);
    });

    it('rechaza tipos no-string', () => {
      expect(() => RefreshTokenHash.of(null as unknown as string)).toThrow(
        RefreshTokenHashInvalidoError,
      );
      expect(() => RefreshTokenHash.of(undefined as unknown as string)).toThrow(
        RefreshTokenHashInvalidoError,
      );
    });
  });

  describe('fromRaw — compute SHA-256', () => {
    it('produce hex lowercase de 64 chars', () => {
      const hash = RefreshTokenHash.fromRaw('any-refresh-token');
      expect(hash.toString()).toMatch(/^[0-9a-f]{64}$/);
    });

    it('mismo input produce mismo hash (determinístico)', () => {
      const a = RefreshTokenHash.fromRaw('tok');
      const b = RefreshTokenHash.fromRaw('tok');
      expect(a.equals(b)).toBe(true);
    });

    it('inputs distintos producen hashes distintos', () => {
      const a = RefreshTokenHash.fromRaw('tok1');
      const b = RefreshTokenHash.fromRaw('tok2');
      expect(a.equals(b)).toBe(false);
    });
  });

  describe('equals', () => {
    it('true si valor normalizado coincide', () => {
      const a = RefreshTokenHash.of('A'.repeat(64));
      const b = RefreshTokenHash.of('a'.repeat(64));
      expect(a.equals(b)).toBe(true);
    });

    it('false si distintos', () => {
      const a = RefreshTokenHash.of('a'.repeat(64));
      const b = RefreshTokenHash.of('b'.repeat(64));
      expect(a.equals(b)).toBe(false);
    });
  });
});
