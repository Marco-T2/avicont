import { normalizarDescripcion } from './normalizar-descripcion';

// Pasos, en orden (design §6.2): NFKC → quitar diacríticos → uppercase →
// NBSP/tabs/saltos a espacio + colapsar + trim → truncar a 200.
describe('normalizarDescripcion (REQ-CB-07, design §6.2)', () => {
  it('quita diacríticos — caso real #953 DEPÓSITO vs DEPOSITO', () => {
    expect(normalizarDescripcion('DEPÓSITO')).toBe(normalizarDescripcion('DEPOSITO'));
    expect(normalizarDescripcion('DEPÓSITO')).toBe('DEPOSITO');
  });

  it('uppercase — bancos alternan capitalización entre exports', () => {
    expect(normalizarDescripcion('Transferencia recibida')).toBe('TRANSFERENCIA RECIBIDA');
  });

  it('NBSP (U+00A0, típico de XLSX) se colapsa a espacio simple', () => {
    expect(normalizarDescripcion('PAGO PROVEEDOR')).toBe('PAGO PROVEEDOR');
  });

  it('tabs y saltos de línea se colapsan a espacio', () => {
    expect(normalizarDescripcion('PAGO\tPROVEEDOR\nNOTA')).toBe('PAGO PROVEEDOR NOTA');
  });

  it('colapsa runs de espacios múltiples a uno solo', () => {
    expect(normalizarDescripcion('PAGO    PROVEEDOR')).toBe('PAGO PROVEEDOR');
  });

  it('hace trim de espacios al inicio/fin', () => {
    expect(normalizarDescripcion('  PAGO PROVEEDOR  ')).toBe('PAGO PROVEEDOR');
  });

  it('NFKC — normaliza formas de ancho completo / ligaduras', () => {
    // 'ﬁ' (U+FB01, ligadura "fi") se descompone a 'fi' bajo NFKC.
    expect(normalizarDescripcion('ﬁnanzas')).toBe('FINANZAS');
  });

  it('trunca a 200 caracteres — cota superior estable', () => {
    const largo = 'A'.repeat(250);
    const resultado = normalizarDescripcion(largo);
    expect(resultado.length).toBe(200);
    expect(resultado).toBe('A'.repeat(200));
  });

  it('NO quita dígitos ni números de referencia', () => {
    expect(normalizarDescripcion('TRANSFERENCIA REF 00123456')).toBe('TRANSFERENCIA REF 00123456');
  });

  it('NO quita puntuación (distingue transferencias del mismo día)', () => {
    expect(normalizarDescripcion('PAGO PROVEEDOR - FACTURA #123')).toBe(
      'PAGO PROVEEDOR - FACTURA #123',
    );
  });

  it('combina todos los pasos a la vez', () => {
    const raw = '  Depósito en\tCuenta\nCorriente  ';
    expect(normalizarDescripcion(raw)).toBe('DEPOSITO EN CUENTA CORRIENTE');
  });

  it('string vacío devuelve string vacío', () => {
    expect(normalizarDescripcion('')).toBe('');
  });

  it('es idempotente: normalizar dos veces da el mismo resultado', () => {
    const una = normalizarDescripcion('Depósito Múltiple');
    expect(normalizarDescripcion(una)).toBe(una);
  });
});
