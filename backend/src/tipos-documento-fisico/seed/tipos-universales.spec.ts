import { TIPOS_UNIVERSALES } from './tipos-universales';

describe('TIPOS_UNIVERSALES (seed de tipos de documento físico)', () => {
  it('define exactamente 8 tipos universales', () => {
    expect(TIPOS_UNIVERSALES).toHaveLength(8);
  });

  it('tiene 4 tipos tributarios y 4 no tributarios', () => {
    const tributarios = TIPOS_UNIVERSALES.filter((t) => t.esTributario);
    const noTributarios = TIPOS_UNIVERSALES.filter((t) => !t.esTributario);
    expect(tributarios).toHaveLength(4);
    expect(noTributarios).toHaveLength(4);
  });

  it('tiene códigos únicos en kebab-case', () => {
    const codigos = TIPOS_UNIVERSALES.map((t) => t.codigo);
    expect(new Set(codigos).size).toBe(codigos.length);
    for (const codigo of codigos) {
      expect(codigo).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    }
  });

  it('los 4 tributarios anticipan el slice 3 (Factura)', () => {
    const tributarios = TIPOS_UNIVERSALES.filter((t) => t.esTributario).map((t) => t.codigo);
    expect(tributarios).toEqual(
      expect.arrayContaining([
        'factura-emitida',
        'factura-recibida',
        'nota-credito-emitida',
        'nota-debito-emitida',
      ]),
    );
  });

  it('cada tipo aplica al menos a un tipo de comprobante', () => {
    for (const tipo of TIPOS_UNIVERSALES) {
      expect(tipo.tiposComprobanteAplicables.length).toBeGreaterThan(0);
    }
  });

  it('todos tienen nombre no vacío', () => {
    for (const tipo of TIPOS_UNIVERSALES) {
      expect(tipo.nombre.trim().length).toBeGreaterThan(0);
    }
  });
});
