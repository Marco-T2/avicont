import {
  ContactoFlagsInvalidosError,
  ContactoRazonSocialRequeridaError,
} from './contacto-errors';
import {
  normalizarDocumento,
  normalizarOpcional,
  validarFlags,
  validarRazonSocial,
} from './contacto-validator';

describe('contacto-validator', () => {
  describe('normalizarDocumento', () => {
    it('devuelve null si el input es null', () => {
      expect(normalizarDocumento(null)).toBeNull();
    });

    it('devuelve null si el input es undefined', () => {
      expect(normalizarDocumento(undefined)).toBeNull();
    });

    it('devuelve null si el input es string vacío', () => {
      expect(normalizarDocumento('')).toBeNull();
    });

    it('devuelve null si el input es solo whitespace', () => {
      expect(normalizarDocumento('   ')).toBeNull();
    });

    it('trimea el documento y lo devuelve', () => {
      expect(normalizarDocumento('  1234567019  ')).toBe('1234567019');
    });

    it('conserva documentos alfanuméricos (pasaporte, CEX)', () => {
      expect(normalizarDocumento('  AB1234567  ')).toBe('AB1234567');
    });
  });

  describe('normalizarOpcional', () => {
    it('devuelve null para entradas vacías o nulas', () => {
      expect(normalizarOpcional(null)).toBeNull();
      expect(normalizarOpcional(undefined)).toBeNull();
      expect(normalizarOpcional('')).toBeNull();
      expect(normalizarOpcional('   ')).toBeNull();
    });

    it('trimea el valor cuando tiene contenido', () => {
      expect(normalizarOpcional('  Granjas El Sol  ')).toBe('Granjas El Sol');
    });
  });

  describe('validarRazonSocial', () => {
    it('acepta razón social de 2 o más chars', () => {
      expect(() => validarRazonSocial('AB')).not.toThrow();
      expect(() => validarRazonSocial('Granjas El Sol SRL')).not.toThrow();
    });

    it('rechaza razón social vacía', () => {
      expect(() => validarRazonSocial('')).toThrow(ContactoRazonSocialRequeridaError);
    });

    it('rechaza razón social de 1 char', () => {
      expect(() => validarRazonSocial('A')).toThrow(ContactoRazonSocialRequeridaError);
    });

    it('rechaza razón social de solo whitespace', () => {
      expect(() => validarRazonSocial('   ')).toThrow(ContactoRazonSocialRequeridaError);
    });

    it('cuenta longitud tras trim — "  A  " tiene 1 char útil y falla', () => {
      expect(() => validarRazonSocial('  A  ')).toThrow(ContactoRazonSocialRequeridaError);
    });

    it('expone la longitud recibida y la mínima en el error', () => {
      try {
        validarRazonSocial('');
        fail('no lanzó');
      } catch (err) {
        const e = err as ContactoRazonSocialRequeridaError;
        expect(e.code).toBe('CONTACTO_RAZON_SOCIAL_REQUERIDA');
        expect(e.httpStatus).toBe(400);
        expect(e.details).toEqual({ longitudRecibida: 0, longitudMinima: 2 });
      }
    });
  });

  describe('validarFlags', () => {
    it('acepta solo cliente', () => {
      expect(() => validarFlags(true, false)).not.toThrow();
    });

    it('acepta solo proveedor', () => {
      expect(() => validarFlags(false, true)).not.toThrow();
    });

    it('acepta ambos (cliente + proveedor)', () => {
      expect(() => validarFlags(true, true)).not.toThrow();
    });

    it('rechaza ambos en false', () => {
      expect(() => validarFlags(false, false)).toThrow(ContactoFlagsInvalidosError);
    });

    it('el error devuelve code y httpStatus esperables', () => {
      try {
        validarFlags(false, false);
        fail('no lanzó');
      } catch (err) {
        const e = err as ContactoFlagsInvalidosError;
        expect(e.code).toBe('CONTACTO_FLAGS_INVALIDOS');
        expect(e.httpStatus).toBe(400);
      }
    });
  });
});
