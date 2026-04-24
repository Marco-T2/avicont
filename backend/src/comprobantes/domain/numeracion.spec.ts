import { TipoComprobante } from '@prisma/client';

import { formatearNumero, PREFIJO_POR_TIPO } from './numeracion';

describe('formatearNumero', () => {
  it('genera "I2604-000042" para INGRESO, 2026-04, correlativo 42', () => {
    expect(formatearNumero(TipoComprobante.INGRESO, 2026, 4, 42)).toBe('I2604-000042');
  });

  it('padea el mes con 0', () => {
    expect(formatearNumero(TipoComprobante.DIARIO, 2026, 1, 7)).toBe('D2601-000007');
  });

  it('padea el correlativo a 6 dígitos', () => {
    expect(formatearNumero(TipoComprobante.EGRESO, 2026, 12, 1)).toBe('E2612-000001');
    expect(formatearNumero(TipoComprobante.EGRESO, 2026, 12, 999999)).toBe('E2612-999999');
  });

  it('toma los últimos 2 dígitos del año', () => {
    expect(formatearNumero(TipoComprobante.APERTURA, 2099, 1, 1)).toBe('A9901-000001');
    expect(formatearNumero(TipoComprobante.APERTURA, 2000, 1, 1)).toBe('A0001-000001');
  });

  it('usa el prefijo correcto para cada tipo', () => {
    expect(PREFIJO_POR_TIPO.APERTURA).toBe('A');
    expect(PREFIJO_POR_TIPO.DIARIO).toBe('D');
    expect(PREFIJO_POR_TIPO.INGRESO).toBe('I');
    expect(PREFIJO_POR_TIPO.EGRESO).toBe('E');
    expect(PREFIJO_POR_TIPO.AJUSTE).toBe('J');
    expect(PREFIJO_POR_TIPO.TRASPASO).toBe('T');
    expect(PREFIJO_POR_TIPO.CIERRE).toBe('C');
  });
});
