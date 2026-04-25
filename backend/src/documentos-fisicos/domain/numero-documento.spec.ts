import {
  NumeroDocumento,
  NumeroDocumentoFormatoInvalidoError,
  NumeroDocumentoLongitudExcedidaError,
  NumeroDocumentoVacioError,
} from './numero-documento';

describe('NumeroDocumento.of', () => {
  it('acepta formato válido alfanumérico con letras, dígitos y separadores', () => {
    expect(NumeroDocumento.of('REC-0042').toString()).toBe('REC-0042');
    expect(NumeroDocumento.of('FC.2026/01').toString()).toBe('FC.2026/01');
    expect(NumeroDocumento.of('42').toString()).toBe('42');
  });

  it('normaliza trim+toUpperCase', () => {
    expect(NumeroDocumento.of('  rec-0042  ').toString()).toBe('REC-0042');
    expect(NumeroDocumento.of('a-001').toString()).toBe('A-001');
  });

  it('preserva ceros a la izquierda — "0042" ≠ "42"', () => {
    const a = NumeroDocumento.of('0042');
    const b = NumeroDocumento.of('42');
    expect(a.toString()).toBe('0042');
    expect(b.toString()).toBe('42');
    expect(a.equals(b)).toBe(false);
  });

  it('rechaza string vacío con NumeroDocumentoVacioError', () => {
    expect(() => NumeroDocumento.of('')).toThrow(NumeroDocumentoVacioError);
  });

  it('rechaza solo espacios (vacío post-trim) con NumeroDocumentoVacioError', () => {
    expect(() => NumeroDocumento.of('   ')).toThrow(NumeroDocumentoVacioError);
    expect(() => NumeroDocumento.of('\t\n')).toThrow(NumeroDocumentoVacioError);
  });

  it('rechaza espacio interno con NumeroDocumentoFormatoInvalidoError', () => {
    expect(() => NumeroDocumento.of('REC 0042')).toThrow(
      NumeroDocumentoFormatoInvalidoError,
    );
  });

  it('rechaza acentos con NumeroDocumentoFormatoInvalidoError', () => {
    expect(() => NumeroDocumento.of('RECÍBO')).toThrow(
      NumeroDocumentoFormatoInvalidoError,
    );
  });

  it('rechaza caracteres no permitidos (@, #, _)', () => {
    expect(() => NumeroDocumento.of('REC@0042')).toThrow(
      NumeroDocumentoFormatoInvalidoError,
    );
    expect(() => NumeroDocumento.of('REC#0042')).toThrow(
      NumeroDocumentoFormatoInvalidoError,
    );
    expect(() => NumeroDocumento.of('REC_0042')).toThrow(
      NumeroDocumentoFormatoInvalidoError,
    );
  });

  it('acepta longitud exactamente 50 (máximo)', () => {
    const numero = 'A'.repeat(50);
    expect(NumeroDocumento.of(numero).toString()).toBe(numero);
  });

  it('rechaza longitud 51 (sobre máximo) con NumeroDocumentoLongitudExcedidaError', () => {
    expect(() => NumeroDocumento.of('A'.repeat(51))).toThrow(
      NumeroDocumentoLongitudExcedidaError,
    );
  });

  it('aplica trim antes de medir longitud máxima', () => {
    const numero = `  ${'A'.repeat(50)}  `;
    expect(NumeroDocumento.of(numero).toString()).toBe('A'.repeat(50));
  });

  it('acepta solo dígitos', () => {
    expect(NumeroDocumento.of('001').toString()).toBe('001');
  });

  it('acepta solo letras (post-normalización)', () => {
    expect(NumeroDocumento.of('REF').toString()).toBe('REF');
  });
});

describe('NumeroDocumento.equals', () => {
  it('true si los números normalizados son iguales', () => {
    const a = NumeroDocumento.of('REC-0042');
    const b = NumeroDocumento.of('  rec-0042  ');
    expect(a.equals(b)).toBe(true);
  });

  it('false si los números difieren', () => {
    const a = NumeroDocumento.of('FC-001');
    const b = NumeroDocumento.of('FC-002');
    expect(a.equals(b)).toBe(false);
  });
});
