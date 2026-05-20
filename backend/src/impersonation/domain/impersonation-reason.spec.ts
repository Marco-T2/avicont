import { ImpersonationReason } from './impersonation-reason';
import { ImpersonationReasonInvalidaError } from './impersonation-errors';

describe('ImpersonationReason', () => {
  describe('of — válidos', () => {
    it('acepta razón de 10 caracteres exactos', () => {
      expect(() => ImpersonationReason.of('1234567890')).not.toThrow();
    });

    it('trimea whitespace antes de validar longitud', () => {
      const r = ImpersonationReason.of('   razón completa del caso   ');
      expect(r.toString()).toBe('razón completa del caso');
    });

    it('acepta razón típica del caso de soporte', () => {
      expect(() =>
        ImpersonationReason.of('Soporte: usuario reporta no poder ver sus comprobantes de marzo'),
      ).not.toThrow();
    });
  });

  describe('of — inválidos', () => {
    it.each([
      ['', 'vacío'],
      ['corta', 'menor al mínimo'],
      ['         9', 'post-trim queda corta'],
    ])('rechaza "%s" (%s)', (raw) => {
      expect(() => ImpersonationReason.of(raw)).toThrow(ImpersonationReasonInvalidaError);
    });

    it('rechaza razón que excede el máximo', () => {
      expect(() => ImpersonationReason.of('x'.repeat(501))).toThrow(
        ImpersonationReasonInvalidaError,
      );
    });

    it('rechaza tipos no-string', () => {
      expect(() => ImpersonationReason.of(null as unknown as string)).toThrow(
        ImpersonationReasonInvalidaError,
      );
    });
  });

  describe('equals', () => {
    it('true si mismo valor', () => {
      const a = ImpersonationReason.of('razón válida uno');
      const b = ImpersonationReason.of('razón válida uno');
      expect(a.equals(b)).toBe(true);
    });

    it('false si distintos', () => {
      const a = ImpersonationReason.of('razón válida uno');
      const b = ImpersonationReason.of('razón válida dos');
      expect(a.equals(b)).toBe(false);
    });
  });
});
