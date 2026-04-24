import { CodigoPuct } from './codigo-puct';

describe('CodigoPuct', () => {
  describe('create — válidos (4 segmentos numéricos)', () => {
    it.each([['1.1.1.001'], ['2.1.1.015'], ['12.345.67.890']])(
      'acepta "%s"',
      (raw) => {
        const codigo = CodigoPuct.create(raw);
        expect(codigo.toString()).toBe(raw);
      },
    );
  });

  describe('create — inválidos', () => {
    it('rechaza string vacío', () => {
      expect(() => CodigoPuct.create('')).toThrow(RangeError);
    });

    it.each([
      ['1', '1 segmento'],
      ['1.1', '2 segmentos'],
      ['1.1.1', '3 segmentos (nivel 3 del catálogo, no mapeable)'],
      ['1.1.1.1.1', '5 segmentos'],
      ['1.1.1.a', 'no numérico'],
      ['1-1-1-001', 'separador inválido'],
    ])('rechaza "%s" (%s)', (raw) => {
      expect(() => CodigoPuct.create(raw)).toThrow(/formato inválido/);
    });
  });

  describe('equals', () => {
    it('true si mismo valor', () => {
      const a = CodigoPuct.create('1.1.1.001');
      const b = CodigoPuct.create('1.1.1.001');
      expect(a.equals(b)).toBe(true);
    });

    it('false si distinto valor', () => {
      const a = CodigoPuct.create('1.1.1.001');
      const b = CodigoPuct.create('1.1.1.002');
      expect(a.equals(b)).toBe(false);
    });
  });
});
