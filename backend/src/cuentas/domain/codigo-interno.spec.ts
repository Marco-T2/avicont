import { CodigoInterno, MAX_NIVELES } from './codigo-interno';

describe('CodigoInterno', () => {
  describe('create — válidos', () => {
    it.each([
      ['1', 1],
      ['1.1', 2],
      ['1.1.1', 3],
      ['1.1.1.001', 4],
      ['1.2.3.4.5.6.7.8', 8],
      ['12.345.6', 3],
    ])('acepta "%s" con nivel %i', (raw, nivelEsperado) => {
      const codigo = CodigoInterno.create(raw);
      expect(codigo.toString()).toBe(raw);
      expect(codigo.nivel()).toBe(nivelEsperado);
    });

    it('expone segmentos como array read-only', () => {
      const codigo = CodigoInterno.create('1.1.1.001');
      expect(codigo.segmentos()).toEqual(['1', '1', '1', '001']);
      expect(Object.isFrozen(codigo.segmentos())).toBe(true);
    });
  });

  describe('create — inválidos', () => {
    it('rechaza string vacío', () => {
      expect(() => CodigoInterno.create('')).toThrow(RangeError);
    });

    it.each([
      ['1.', 'termina en punto'],
      ['.1', 'empieza con punto'],
      ['1..1', 'doble punto'],
      ['1.a', 'contiene letra'],
      ['1-1', 'usa guion'],
      [' 1.1', 'con espacio al inicio'],
    ])('rechaza formato "%s" (%s)', (raw) => {
      expect(() => CodigoInterno.create(raw)).toThrow(/formato inválido/);
    });

    it('rechaza más de 8 niveles', () => {
      const nueveNiveles = Array.from({ length: 9 }, (_, i) => i + 1).join('.');
      expect(() => CodigoInterno.create(nueveNiveles)).toThrow(
        new RegExp(`máximo de ${MAX_NIVELES}`),
      );
    });
  });

  describe('equals', () => {
    it('true si mismo valor', () => {
      const a = CodigoInterno.create('1.1.1.001');
      const b = CodigoInterno.create('1.1.1.001');
      expect(a.equals(b)).toBe(true);
    });

    it('false si distinto valor', () => {
      const a = CodigoInterno.create('1.1.1.001');
      const b = CodigoInterno.create('1.1.1.002');
      expect(a.equals(b)).toBe(false);
    });
  });
});
