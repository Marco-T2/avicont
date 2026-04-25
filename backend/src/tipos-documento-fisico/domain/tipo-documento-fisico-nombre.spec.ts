import { TipoDocumentoFisicoNombre } from './tipo-documento-fisico-nombre';

describe('TipoDocumentoFisicoNombre.of', () => {
  it('acepta nombre normal', () => {
    expect(TipoDocumentoFisicoNombre.of('Factura recibida').toString()).toBe(
      'Factura recibida',
    );
  });

  it('aplica trim sin tocar el casing interno', () => {
    expect(TipoDocumentoFisicoNombre.of('   Recibo Egreso   ').toString()).toBe(
      'Recibo Egreso',
    );
  });

  it('acepta acentos y caracteres legibles', () => {
    expect(TipoDocumentoFisicoNombre.of('Nota de débito').toString()).toBe(
      'Nota de débito',
    );
    expect(
      TipoDocumentoFisicoNombre.of('Comprobante interno (provisional)').toString(),
    ).toBe('Comprobante interno (provisional)');
  });

  it('rechaza vacío', () => {
    expect(() => TipoDocumentoFisicoNombre.of('')).toThrow(RangeError);
  });

  it('rechaza solo espacios (vacío post-trim)', () => {
    expect(() => TipoDocumentoFisicoNombre.of('   ')).toThrow(RangeError);
    expect(() => TipoDocumentoFisicoNombre.of('\t\n')).toThrow(RangeError);
  });

  it('acepta longitud exactamente 1 (mínimo)', () => {
    expect(TipoDocumentoFisicoNombre.of('A').toString()).toBe('A');
  });

  it('acepta longitud exactamente 100 (máximo)', () => {
    const nombre = 'A'.repeat(100);
    expect(TipoDocumentoFisicoNombre.of(nombre).toString()).toBe(nombre);
  });

  it('rechaza longitud 101 (sobre máximo)', () => {
    expect(() => TipoDocumentoFisicoNombre.of('A'.repeat(101))).toThrow(RangeError);
  });

  it('aplica trim antes de medir longitud máxima', () => {
    const nombre = `  ${'A'.repeat(100)}  `;
    expect(TipoDocumentoFisicoNombre.of(nombre).toString()).toBe('A'.repeat(100));
  });
});

describe('TipoDocumentoFisicoNombre.equals', () => {
  it('true si los nombres normalizados son iguales (case-sensitive)', () => {
    const a = TipoDocumentoFisicoNombre.of('Factura');
    const b = TipoDocumentoFisicoNombre.of('  Factura  ');
    expect(a.equals(b)).toBe(true);
  });

  it('false si los nombres difieren (case-sensitive)', () => {
    const a = TipoDocumentoFisicoNombre.of('Factura');
    const b = TipoDocumentoFisicoNombre.of('factura');
    expect(a.equals(b)).toBe(false);
  });
});
