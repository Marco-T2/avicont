import { Decimal } from '@prisma/client/runtime/library';

import { ClaseCuenta, NaturalezaCuenta, SubClaseCuenta } from '@/common/domain/enums';

import { calcularResultadoEjercicioBob } from './resultado-ejercicio';
import type { CuentaEstructuraRow, SaldoCuentaRow } from '../ports/eeff-saldos-reader.port';

function makeCuenta(overrides: Partial<CuentaEstructuraRow> = {}): CuentaEstructuraRow {
  return {
    id: 'cuenta-1',
    parentId: null,
    nivel: 1,
    esDetalle: true,
    esContraria: false,
    claseCuenta: ClaseCuenta.INGRESO,
    subClaseCuenta: SubClaseCuenta.INGRESO_OPERATIVO,
    naturaleza: NaturalezaCuenta.ACREEDORA,
    codigoInterno: '4.1.1.001',
    nombre: 'Ventas',
    actividadFlujo: null,
    ...overrides,
  };
}

function makeSaldo(cuentaId: string, debe: string, haber: string): SaldoCuentaRow {
  return {
    cuentaId,
    totalDebitoBob: new Decimal(debe),
    totalCreditoBob: new Decimal(haber),
  };
}

describe('calcularResultadoEjercicioBob', () => {
  it('utilidad: Σ INGRESO − Σ EGRESO positivo', () => {
    const ingreso = makeCuenta({ id: 'i1', claseCuenta: ClaseCuenta.INGRESO });
    const egreso = makeCuenta({
      id: 'e1',
      claseCuenta: ClaseCuenta.EGRESO,
      naturaleza: NaturalezaCuenta.DEUDORA,
      codigoInterno: '5.1.1.001',
      nombre: 'Costo de ventas',
    });

    const result = calcularResultadoEjercicioBob(
      [ingreso, egreso],
      [makeSaldo('i1', '0.00', '10000.00'), makeSaldo('e1', '3000.00', '0.00')],
    );

    expect(result.toBob()).toBe('7000.00');
  });

  it('pérdida: resultado negativo cuando egresos superan ingresos', () => {
    const ingreso = makeCuenta({ id: 'i1', claseCuenta: ClaseCuenta.INGRESO });
    const egreso = makeCuenta({
      id: 'e1',
      claseCuenta: ClaseCuenta.EGRESO,
      naturaleza: NaturalezaCuenta.DEUDORA,
    });

    const result = calcularResultadoEjercicioBob(
      [ingreso, egreso],
      [makeSaldo('i1', '0.00', '2000.00'), makeSaldo('e1', '5000.00', '0.00')],
    );

    expect(result.toBob()).toBe('-3000.00');
  });

  it('ignora cuentas de ACTIVO/PASIVO/PATRIMONIO', () => {
    const activo = makeCuenta({
      id: 'a1',
      claseCuenta: ClaseCuenta.ACTIVO,
      naturaleza: NaturalezaCuenta.DEUDORA,
    });
    const patrimonio = makeCuenta({
      id: 'p1',
      claseCuenta: ClaseCuenta.PATRIMONIO,
      naturaleza: NaturalezaCuenta.ACREEDORA,
    });

    const result = calcularResultadoEjercicioBob(
      [activo, patrimonio],
      [makeSaldo('a1', '9000.00', '0.00'), makeSaldo('p1', '0.00', '9000.00')],
    );

    expect(result.toBob()).toBe('0.00');
  });

  it('ignora agrupadores (esDetalle=false)', () => {
    const agrupador = makeCuenta({ id: 'g1', esDetalle: false, claseCuenta: ClaseCuenta.INGRESO });

    const result = calcularResultadoEjercicioBob([agrupador], [makeSaldo('g1', '0.00', '5000.00')]);

    expect(result.toBob()).toBe('0.00');
  });

  it('cuenta sin saldo en el rango se trata como 0', () => {
    const ingreso = makeCuenta({ id: 'i1', claseCuenta: ClaseCuenta.INGRESO });

    const result = calcularResultadoEjercicioBob([ingreso], []);

    expect(result.toBob()).toBe('0.00');
  });
});
