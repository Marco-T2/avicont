import { DisplayName, MAX_LONGITUD_DISPLAY_NAME } from './display-name';
import { DisplayNameInvalidoError } from './user-errors';

describe('DisplayName', () => {
  describe('of — válidos', () => {
    it('acepta un nombre normal', () => {
      expect(() => DisplayName.of('Marco Tarqui')).not.toThrow();
    });

    it('normaliza con trim', () => {
      const name = DisplayName.of('   Marco Tarqui   ');
      expect(name.toString()).toBe('Marco Tarqui');
    });

    it('acepta el máximo exacto de caracteres', () => {
      const justo = 'a'.repeat(MAX_LONGITUD_DISPLAY_NAME);
      expect(() => DisplayName.of(justo)).not.toThrow();
    });
  });

  describe('of — inválidos', () => {
    it('rechaza string vacío', () => {
      expect(() => DisplayName.of('')).toThrow(DisplayNameInvalidoError);
    });

    it('rechaza solo espacios', () => {
      expect(() => DisplayName.of('   ')).toThrow(DisplayNameInvalidoError);
    });

    it('rechaza más del máximo permitido', () => {
      const demasiado = 'a'.repeat(MAX_LONGITUD_DISPLAY_NAME + 1);
      expect(() => DisplayName.of(demasiado)).toThrow(DisplayNameInvalidoError);
    });

    it('rechaza tipos no-string', () => {
      expect(() => DisplayName.of(null as unknown as string)).toThrow(DisplayNameInvalidoError);
      expect(() => DisplayName.of(undefined as unknown as string)).toThrow(DisplayNameInvalidoError);
      expect(() => DisplayName.of(123 as unknown as string)).toThrow(DisplayNameInvalidoError);
    });
  });

  describe('equals', () => {
    it('true si mismo valor normalizado', () => {
      const a = DisplayName.of('  Marco  ');
      const b = DisplayName.of('Marco');
      expect(a.equals(b)).toBe(true);
    });

    it('false si distintos', () => {
      const a = DisplayName.of('Marco');
      const b = DisplayName.of('Otro');
      expect(a.equals(b)).toBe(false);
    });
  });
});
