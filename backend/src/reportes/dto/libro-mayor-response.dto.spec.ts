import { NaturalezaCuenta } from '@/common/domain/enums';

import { Money } from '@/common/domain/money';

import type { CuentaMayorCalculada } from './libro-mayor-response.dto';
import { toLibroMayorResponse } from './libro-mayor-response.dto';

// ============================================================
// Fixtures
// ============================================================

function makeMovimiento(
  overrides: Partial<{
    comprobanteId: string;
    numeroComprobante: string | null;
    fechaContable: Date;
    glosa: string;
    glosaLinea: string | null;
    estado: string;
    anulado: boolean;
    orden: number;
    debeBob: string;
    haberBob: string;
    saldoCorrienteBob: string;
  }> = {},
) {
  return {
    comprobanteId: 'comp-1',
    numeroComprobante: 'D2601-000001',
    fechaContable: new Date('2026-01-15T00:00:00Z'),
    glosa: 'Venta',
    glosaLinea: null,
    estado: 'CONTABILIZADO',
    anulado: false,
    orden: 1,
    debeBob: '1000.00',
    haberBob: '0.00',
    saldoCorrienteBob: '1500.00',
    ...overrides,
  };
}

function makeCuentaCalculada(overrides: Partial<CuentaMayorCalculada> = {}): CuentaMayorCalculada {
  return {
    cuentaId: 'cuenta-1',
    codigoInterno: '1.1.1.001',
    nombreCuenta: 'Caja MN',
    naturaleza: NaturalezaCuenta.DEUDORA,
    saldoInicial: Money.of('500.00'),
    saldoFinal: Money.of('1500.00'),
    movimientos: [makeMovimiento()],
    totalDebeBob: Money.of('1000.00'),
    totalHaberBob: Money.of('0.00'),
    ...overrides,
  };
}

// ============================================================
// Tests
// ============================================================

const rango = {
  desde: new Date('2026-01-01T00:00:00Z'),
  hasta: new Date('2026-01-31T00:00:00Z'),
};

describe('toLibroMayorResponse (unit)', () => {
  it('mapea una cuenta DEUDORA con un movimiento correctamente', () => {
    const cuentas = [makeCuentaCalculada()];
    const result = toLibroMayorResponse(cuentas, rango);

    expect(result.cuentas).toHaveLength(1);
    const cuenta = result.cuentas[0]!;
    expect(cuenta.cuentaId).toBe('cuenta-1');
    expect(cuenta.codigoInterno).toBe('1.1.1.001');
    expect(cuenta.nombreCuenta).toBe('Caja MN');
    expect(cuenta.naturaleza).toBe('DEUDORA');
  });

  it('serializa Money → string con 2 decimales fijos (§4.5 CLAUDE.md)', () => {
    const cuentas = [makeCuentaCalculada()];
    const result = toLibroMayorResponse(cuentas, rango);

    const cuenta = result.cuentas[0]!;
    expect(cuenta.saldoInicialBob).toBe('500.00');
    expect(cuenta.saldoFinalBob).toBe('1500.00');
    expect(cuenta.totalDebeBob).toBe('1000.00');
    expect(cuenta.totalHaberBob).toBe('0.00');
  });

  it('formatea fechaContable a YYYY-MM-DD (§4.6 CLAUDE.md) usando UTC', () => {
    const cuentas = [makeCuentaCalculada()];
    const result = toLibroMayorResponse(cuentas, rango);

    const mov = result.cuentas[0]!.movimientos[0]!;
    expect(mov.fechaContable).toBe('2026-01-15');
  });

  it('mapea glosaLinea null cuando la línea no tiene glosa propia (REQ-LM-10)', () => {
    const cuentas = [makeCuentaCalculada()];
    const result = toLibroMayorResponse(cuentas, rango);

    const mov = result.cuentas[0]!.movimientos[0]!;
    expect(mov.glosa).toBe('Venta');
    expect(mov.glosaLinea).toBeNull();
  });

  it('mapea glosaLinea cuando existe', () => {
    const cuentas = [
      makeCuentaCalculada({
        movimientos: [makeMovimiento({ glosaLinea: 'Detalle del cobro' })],
      }),
    ];
    const result = toLibroMayorResponse(cuentas, rango);

    expect(result.cuentas[0]!.movimientos[0]!.glosaLinea).toBe('Detalle del cobro');
  });

  it('cuenta sin movimientos: movimientos=[], saldoFinalBob === saldoInicialBob (REQ-LM-06)', () => {
    const cuentas = [
      makeCuentaCalculada({
        movimientos: [],
        saldoInicial: Money.of('300.00'),
        saldoFinal: Money.of('300.00'),
        totalDebeBob: Money.ZERO,
        totalHaberBob: Money.ZERO,
      }),
    ];
    const result = toLibroMayorResponse(cuentas, rango);

    const cuenta = result.cuentas[0]!;
    expect(cuenta.movimientos).toHaveLength(0);
    expect(cuenta.saldoInicialBob).toBe('300.00');
    expect(cuenta.saldoFinalBob).toBe('300.00');
  });

  it('mapea el rango a strings YYYY-MM-DD en el response', () => {
    const result = toLibroMayorResponse([], rango);

    expect(result.rango.fechaDesde).toBe('2026-01-01');
    expect(result.rango.fechaHasta).toBe('2026-01-31');
  });

  it('devuelve cuentas vacías y totales 0.00 cuando no hay cuentas', () => {
    const result = toLibroMayorResponse([], rango);

    expect(result.cuentas).toHaveLength(0);
    expect(result.totalDebeBob).toBe('0.00');
    expect(result.totalHaberBob).toBe('0.00');
  });

  it('suma totalDebeBob y totalHaberBob de todas las cuentas (REQ-LM-06)', () => {
    const cuentas = [
      makeCuentaCalculada({
        totalDebeBob: Money.of('1000.00'),
        totalHaberBob: Money.of('0.00'),
      }),
      makeCuentaCalculada({
        cuentaId: 'cuenta-2',
        codigoInterno: '4.1.1.001',
        totalDebeBob: Money.of('0.00'),
        totalHaberBob: Money.of('1000.00'),
      }),
    ];
    const result = toLibroMayorResponse(cuentas, rango);

    expect(result.totalDebeBob).toBe('1000.00');
    expect(result.totalHaberBob).toBe('1000.00');
  });

  it('maneja saldo inicial negativo (DEUDORA con más créditos que débitos)', () => {
    const cuentas = [
      makeCuentaCalculada({
        saldoInicial: Money.of('-300.00'),
        saldoFinal: Money.of('-300.00'),
      }),
    ];
    const result = toLibroMayorResponse(cuentas, rango);

    expect(result.cuentas[0]!.saldoInicialBob).toBe('-300.00');
    expect(result.cuentas[0]!.saldoFinalBob).toBe('-300.00');
  });

  it('mapea anulado=true en movimientos de comprobantes anulados', () => {
    const cuentas = [
      makeCuentaCalculada({
        movimientos: [makeMovimiento({ anulado: true })],
      }),
    ];
    const result = toLibroMayorResponse(cuentas, rango);

    expect(result.cuentas[0]!.movimientos[0]!.anulado).toBe(true);
  });
});
