import { FeatureFlagKey } from './feature-flag-key';
import { FeatureFlagKeyInvalidaError } from './feature-flag-errors';

describe('FeatureFlagKey', () => {
  describe('of — válidas', () => {
    it.each([
      'granja_enabled',
      'new_dashboard',
      'asientos_v2',
      'a',
      'ab_12',
      'feature_with_many_underscores_and_123',
    ])('acepta "%s"', (raw) => {
      expect(() => FeatureFlagKey.of(raw)).not.toThrow();
    });

    it('preserva el valor exacto (no normaliza)', () => {
      const key = FeatureFlagKey.of('granja_enabled');
      expect(key.toString()).toBe('granja_enabled');
    });
  });

  describe('of — inválidas', () => {
    it('rechaza string vacío', () => {
      expect(() => FeatureFlagKey.of('')).toThrow(FeatureFlagKeyInvalidaError);
    });

    it.each([
      ['Granja', 'mayúscula'],
      ['1feature', 'arranca con número'],
      ['_feature', 'arranca con underscore'],
      ['feature-name', 'contiene guión'],
      ['feature.name', 'contiene punto'],
      ['feature name', 'contiene espacio'],
      [' feature', 'espacio inicial (no hay trim)'],
      ['feature ', 'espacio final (no hay trim)'],
      ['featureñ', 'caracter no ASCII'],
    ])('rechaza "%s" (%s)', (raw) => {
      expect(() => FeatureFlagKey.of(raw)).toThrow(FeatureFlagKeyInvalidaError);
    });

    it('rechaza más de 100 caracteres', () => {
      const largo = 'a'.repeat(101);
      expect(() => FeatureFlagKey.of(largo)).toThrow(FeatureFlagKeyInvalidaError);
    });

    it('acepta exactamente 100 caracteres', () => {
      const limite = 'a'.repeat(100);
      expect(() => FeatureFlagKey.of(limite)).not.toThrow();
    });

    it('rechaza tipos no-string', () => {
      expect(() => FeatureFlagKey.of(123 as unknown as string)).toThrow(
        FeatureFlagKeyInvalidaError,
      );
      expect(() => FeatureFlagKey.of(null as unknown as string)).toThrow(
        FeatureFlagKeyInvalidaError,
      );
      expect(() => FeatureFlagKey.of(undefined as unknown as string)).toThrow(
        FeatureFlagKeyInvalidaError,
      );
    });
  });

  describe('equals', () => {
    it('true si valores idénticos', () => {
      const a = FeatureFlagKey.of('granja_enabled');
      const b = FeatureFlagKey.of('granja_enabled');
      expect(a.equals(b)).toBe(true);
    });

    it('false si distintas', () => {
      const a = FeatureFlagKey.of('granja_enabled');
      const b = FeatureFlagKey.of('contabilidad_enabled');
      expect(a.equals(b)).toBe(false);
    });
  });
});
