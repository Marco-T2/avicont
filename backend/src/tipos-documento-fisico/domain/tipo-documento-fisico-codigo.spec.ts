import { TipoDocumentoFisicoCodigo } from './tipo-documento-fisico-codigo';

describe('TipoDocumentoFisicoCodigo.of', () => {
  it('acepta kebab-case alfanumérico', () => {
    expect(TipoDocumentoFisicoCodigo.of('factura-recibida').toString()).toBe('factura-recibida');
  });

  it('acepta un solo segmento alfanumérico', () => {
    expect(TipoDocumentoFisicoCodigo.of('recibo').toString()).toBe('recibo');
  });

  it('acepta dígitos en cualquier segmento', () => {
    expect(TipoDocumentoFisicoCodigo.of('vale-2025').toString()).toBe('vale-2025');
    expect(TipoDocumentoFisicoCodigo.of('123').toString()).toBe('123');
  });

  it('normaliza trim+lowercase antes de validar', () => {
    expect(TipoDocumentoFisicoCodigo.of('  Factura-Recibida  ').toString()).toBe(
      'factura-recibida',
    );
  });

  it('rechaza string vacío post-trim', () => {
    expect(() => TipoDocumentoFisicoCodigo.of('   ')).toThrow(RangeError);
    expect(() => TipoDocumentoFisicoCodigo.of('')).toThrow(RangeError);
  });

  it('rechaza guiones al inicio o final', () => {
    expect(() => TipoDocumentoFisicoCodigo.of('-recibo')).toThrow(RangeError);
    expect(() => TipoDocumentoFisicoCodigo.of('recibo-')).toThrow(RangeError);
  });

  it('rechaza guiones consecutivos', () => {
    expect(() => TipoDocumentoFisicoCodigo.of('factura--recibida')).toThrow(RangeError);
  });

  it('rechaza espacios internos', () => {
    expect(() => TipoDocumentoFisicoCodigo.of('factura recibida')).toThrow(RangeError);
  });

  it('rechaza caracteres especiales (underscore, punto, slash, arroba)', () => {
    expect(() => TipoDocumentoFisicoCodigo.of('factura_recibida')).toThrow(RangeError);
    expect(() => TipoDocumentoFisicoCodigo.of('factura.recibida')).toThrow(RangeError);
    expect(() => TipoDocumentoFisicoCodigo.of('factura/recibida')).toThrow(RangeError);
    expect(() => TipoDocumentoFisicoCodigo.of('factura@recibida')).toThrow(RangeError);
  });

  it('rechaza acentos y diacríticos', () => {
    expect(() => TipoDocumentoFisicoCodigo.of('factura-recibída')).toThrow(RangeError);
  });

  it('acepta longitud 1 (mínimo)', () => {
    expect(TipoDocumentoFisicoCodigo.of('a').toString()).toBe('a');
  });

  it('acepta longitud exactamente 20 (máximo)', () => {
    const codigo = 'a'.repeat(20);
    expect(TipoDocumentoFisicoCodigo.of(codigo).toString()).toBe(codigo);
  });

  it('rechaza longitud 21 (sobre máximo, post-normalización)', () => {
    expect(() => TipoDocumentoFisicoCodigo.of('a'.repeat(21))).toThrow(RangeError);
  });
});

describe('TipoDocumentoFisicoCodigo.equals', () => {
  it('true si los códigos normalizados son iguales', () => {
    const a = TipoDocumentoFisicoCodigo.of('factura-recibida');
    const b = TipoDocumentoFisicoCodigo.of('Factura-Recibida');
    expect(a.equals(b)).toBe(true);
  });

  it('false si los códigos normalizados difieren', () => {
    const a = TipoDocumentoFisicoCodigo.of('factura');
    const b = TipoDocumentoFisicoCodigo.of('recibo');
    expect(a.equals(b)).toBe(false);
  });
});
