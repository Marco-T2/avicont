import { Decimal } from '@prisma/client/runtime/library';

import { ClaseCuenta, NaturalezaCuenta, SubClaseCuenta } from '@/common/domain/enums';

import { construirEvolucionPatrimonio } from './evolucion-patrimonio';
import type { CuentaEstructuraRow, SaldoCuentaRow } from '../ports/eeff-saldos-reader.port';

// ============================================================
// Fixtures
// ============================================================

function makeCuenta(overrides: Partial<CuentaEstructuraRow> = {}): CuentaEstructuraRow {
  return {
    id: 'cap',
    parentId: null,
    nivel: 1,
    esDetalle: true,
    esContraria: false,
    claseCuenta: ClaseCuenta.PATRIMONIO,
    subClaseCuenta: SubClaseCuenta.PATRIMONIO_CAPITAL,
    naturaleza: NaturalezaCuenta.ACREEDORA,
    codigoInterno: '3.1.1.001',
    nombre: 'Capital Social',
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

function comp(result: ReturnType<typeof construirEvolucionPatrimonio>, cuentaId: string | null) {
  return result.componentes.find((c) => c.cuentaId === cuentaId);
}

// ============================================================
// Componentes del patrimonio (cuentas hoja ACREEDORAS)
// ============================================================

describe('construirEvolucionPatrimonio — componentes del patrimonio', () => {
  it('una cuenta de patrimonio: saldoInicial + otrosMovimientos = saldoFinal', () => {
    const capital = makeCuenta({ id: 'cap' });

    const result = construirEvolucionPatrimonio({
      estructura: [capital],
      // saldo inicial ACREEDORA = haber − debe = 100000
      saldosInicial: [makeSaldo('cap', '0.00', '100000.00')],
      // saldo final = 150000
      saldosFinal: [makeSaldo('cap', '0.00', '150000.00')],
      // movimiento del rango = 50000 (aporte)
      saldosRango: [makeSaldo('cap', '0.00', '50000.00')],
    });

    const c = comp(result, 'cap');
    expect(c).toBeDefined();
    expect(c!.saldoInicialBob.toBob()).toBe('100000.00');
    expect(c!.otrosMovimientosBob.toBob()).toBe('50000.00');
    expect(c!.resultadoEjercicioBob.toBob()).toBe('0.00');
    expect(c!.saldoFinalBob.toBob()).toBe('150000.00');
    expect(c!.cuadra).toBe(true);
    expect(c!.diferenciaBob.toBob()).toBe('0.00');
  });

  it('una distribución reduce el patrimonio (otrosMovimientos negativo)', () => {
    const acumulados = makeCuenta({
      id: 'acum',
      subClaseCuenta: SubClaseCuenta.PATRIMONIO_RESULTADOS,
      codigoInterno: '3.1.3.001',
      nombre: 'Resultados Acumulados',
    });

    const result = construirEvolucionPatrimonio({
      estructura: [acumulados],
      saldosInicial: [makeSaldo('acum', '0.00', '25000.00')],
      saldosFinal: [makeSaldo('acum', '0.00', '15000.00')],
      // débito 10000 = distribución (reduce una cuenta ACREEDORA)
      saldosRango: [makeSaldo('acum', '10000.00', '0.00')],
    });

    const c = comp(result, 'acum');
    expect(c!.otrosMovimientosBob.toBob()).toBe('-10000.00');
    expect(c!.saldoFinalBob.toBob()).toBe('15000.00');
    expect(c!.cuadra).toBe(true);
  });

  it('omite cuentas de patrimonio sin contenido (todo en cero)', () => {
    const capital = makeCuenta({ id: 'cap' });
    const vacia = makeCuenta({ id: 'vac', codigoInterno: '3.1.1.002', nombre: 'Aportes futuros' });

    const result = construirEvolucionPatrimonio({
      estructura: [capital, vacia],
      saldosInicial: [makeSaldo('cap', '0.00', '100000.00')],
      saldosFinal: [makeSaldo('cap', '0.00', '100000.00')],
      saldosRango: [],
    });

    expect(comp(result, 'cap')).toBeDefined();
    expect(comp(result, 'vac')).toBeUndefined();
  });

  it('ignora cuentas que no son de patrimonio', () => {
    const capital = makeCuenta({ id: 'cap' });
    const activo = makeCuenta({
      id: 'caja',
      claseCuenta: ClaseCuenta.ACTIVO,
      subClaseCuenta: SubClaseCuenta.ACTIVO_CORRIENTE,
      naturaleza: NaturalezaCuenta.DEUDORA,
      codigoInterno: '1.1.1.001',
      nombre: 'Caja',
    });

    const result = construirEvolucionPatrimonio({
      estructura: [capital, activo],
      saldosInicial: [makeSaldo('cap', '0.00', '100000.00'), makeSaldo('caja', '500.00', '0.00')],
      saldosFinal: [makeSaldo('cap', '0.00', '100000.00'), makeSaldo('caja', '900.00', '0.00')],
      saldosRango: [makeSaldo('caja', '400.00', '0.00')],
    });

    expect(comp(result, 'caja')).toBeUndefined();
    expect(comp(result, 'cap')).toBeDefined();
  });

  it('ignora agrupadores de patrimonio (esDetalle=false)', () => {
    const grupo = makeCuenta({ id: 'g', esDetalle: false, nombre: 'PATRIMONIO' });
    const hoja = makeCuenta({ id: 'cap', parentId: 'g' });

    const result = construirEvolucionPatrimonio({
      estructura: [grupo, hoja],
      saldosInicial: [makeSaldo('cap', '0.00', '100000.00')],
      saldosFinal: [makeSaldo('cap', '0.00', '100000.00')],
      saldosRango: [],
    });

    expect(comp(result, 'g')).toBeUndefined();
    expect(comp(result, 'cap')).toBeDefined();
  });
});

// ============================================================
// Columna sintética del Resultado del Ejercicio
// ============================================================

describe('construirEvolucionPatrimonio — Resultado del Ejercicio (en curso)', () => {
  const capital = makeCuenta({ id: 'cap' });
  const ingreso = makeCuenta({
    id: 'i1',
    claseCuenta: ClaseCuenta.INGRESO,
    subClaseCuenta: SubClaseCuenta.INGRESO_OPERATIVO,
    naturaleza: NaturalezaCuenta.ACREEDORA,
    codigoInterno: '4.1.1.001',
    nombre: 'Ventas',
  });
  const egreso = makeCuenta({
    id: 'e1',
    claseCuenta: ClaseCuenta.EGRESO,
    subClaseCuenta: SubClaseCuenta.EGRESO_OPERATIVO,
    naturaleza: NaturalezaCuenta.DEUDORA,
    codigoInterno: '5.1.1.001',
    nombre: 'Costos',
  });

  it('agrega columna sintética con el resultado computado (utilidad)', () => {
    const result = construirEvolucionPatrimonio({
      estructura: [capital, ingreso, egreso],
      saldosInicial: [makeSaldo('cap', '0.00', '100000.00')],
      saldosFinal: [makeSaldo('cap', '0.00', '100000.00')],
      // ingresos 30000, egresos 10000 → resultado 20000
      saldosRango: [makeSaldo('i1', '0.00', '30000.00'), makeSaldo('e1', '10000.00', '0.00')],
    });

    const sintetica = result.componentes.find((c) => c.esSintetica);
    expect(sintetica).toBeDefined();
    expect(sintetica!.cuentaId).toBeNull();
    expect(sintetica!.nombre).toBe('Resultado del Ejercicio (en curso)');
    expect(sintetica!.saldoInicialBob.toBob()).toBe('0.00');
    expect(sintetica!.resultadoEjercicioBob.toBob()).toBe('20000.00');
    expect(sintetica!.otrosMovimientosBob.toBob()).toBe('0.00');
    expect(sintetica!.saldoFinalBob.toBob()).toBe('20000.00');
    expect(sintetica!.cuadra).toBe(true);
  });

  it('NO agrega columna sintética cuando el resultado es cero', () => {
    const result = construirEvolucionPatrimonio({
      estructura: [capital],
      saldosInicial: [makeSaldo('cap', '0.00', '100000.00')],
      saldosFinal: [makeSaldo('cap', '0.00', '100000.00')],
      saldosRango: [],
    });

    expect(result.componentes.some((c) => c.esSintetica)).toBe(false);
  });

  it('la columna sintética NO duplica el resultado de las cuentas del Mayor (pre-cierre)', () => {
    // Pre-cierre: el resultado vive en ingresos/egresos, NO en una cuenta de patrimonio.
    // El patrimonio del Mayor no se mueve; el resultado aparece SOLO en la sintética.
    const result = construirEvolucionPatrimonio({
      estructura: [capital, ingreso, egreso],
      saldosInicial: [makeSaldo('cap', '0.00', '100000.00')],
      saldosFinal: [makeSaldo('cap', '0.00', '100000.00')],
      saldosRango: [makeSaldo('i1', '0.00', '30000.00'), makeSaldo('e1', '10000.00', '0.00')],
    });

    const cap = comp(result, 'cap');
    expect(cap!.otrosMovimientosBob.toBob()).toBe('0.00');
    expect(result.totales.resultadoEjercicioBob.toBob()).toBe('20000.00');
    expect(result.totales.saldoFinalBob.toBob()).toBe('120000.00'); // 100000 capital + 20000 resultado
  });
});

// ============================================================
// Totales y cuadre
// ============================================================

describe('construirEvolucionPatrimonio — totales y cuadre', () => {
  it('totaliza las 4 columnas y cuadra', () => {
    const capital = makeCuenta({ id: 'cap' });
    const acumulados = makeCuenta({
      id: 'acum',
      subClaseCuenta: SubClaseCuenta.PATRIMONIO_RESULTADOS,
      codigoInterno: '3.1.3.001',
      nombre: 'Resultados Acumulados',
    });
    const ingreso = makeCuenta({
      id: 'i1',
      claseCuenta: ClaseCuenta.INGRESO,
      naturaleza: NaturalezaCuenta.ACREEDORA,
      codigoInterno: '4.1.1.001',
      nombre: 'Ventas',
    });

    const result = construirEvolucionPatrimonio({
      estructura: [capital, acumulados, ingreso],
      saldosInicial: [makeSaldo('cap', '0.00', '100000.00'), makeSaldo('acum', '0.00', '25000.00')],
      saldosFinal: [makeSaldo('cap', '0.00', '150000.00'), makeSaldo('acum', '0.00', '15000.00')],
      saldosRango: [
        makeSaldo('cap', '0.00', '50000.00'), // aporte
        makeSaldo('acum', '10000.00', '0.00'), // distribución
        makeSaldo('i1', '0.00', '30000.00'), // resultado 30000
      ],
    });

    expect(result.totales.saldoInicialBob.toBob()).toBe('125000.00');
    expect(result.totales.otrosMovimientosBob.toBob()).toBe('40000.00'); // 50000 − 10000
    expect(result.totales.resultadoEjercicioBob.toBob()).toBe('30000.00');
    // saldoFinal = 150000 + 15000 + 30000 (sintética) = 195000
    expect(result.totales.saldoFinalBob.toBob()).toBe('195000.00');
    // 125000 + 30000 + 40000 = 195000
    expect(result.cuadra).toBe(true);
    expect(result.diferenciaBob.toBob()).toBe('0.00');
  });

  it('cuenta contraria RESTA del total del patrimonio', () => {
    const capital = makeCuenta({ id: 'cap' });
    const contraria = makeCuenta({
      id: 'ctr',
      esContraria: true,
      subClaseCuenta: SubClaseCuenta.PATRIMONIO_RESULTADOS,
      codigoInterno: '3.1.9.001',
      nombre: 'Acciones en tesorería',
    });

    const result = construirEvolucionPatrimonio({
      estructura: [capital, contraria],
      saldosInicial: [makeSaldo('cap', '0.00', '100000.00'), makeSaldo('ctr', '0.00', '5000.00')],
      saldosFinal: [makeSaldo('cap', '0.00', '100000.00'), makeSaldo('ctr', '0.00', '5000.00')],
      saldosRango: [],
    });

    // 100000 − 5000 = 95000
    expect(result.totales.saldoFinalBob.toBob()).toBe('95000.00');
    expect(result.totales.saldoInicialBob.toBob()).toBe('95000.00');
    expect(result.cuadra).toBe(true);
  });

  it('reporta descuadre cuando saldoInicial + movimientos ≠ saldoFinal', () => {
    const capital = makeCuenta({ id: 'cap' });

    const result = construirEvolucionPatrimonio({
      estructura: [capital],
      saldosInicial: [makeSaldo('cap', '0.00', '100000.00')],
      // saldo final inconsistente con el movimiento (dato corrupto a propósito)
      saldosFinal: [makeSaldo('cap', '0.00', '999999.00')],
      saldosRango: [makeSaldo('cap', '0.00', '50000.00')],
    });

    const c = comp(result, 'cap');
    expect(c!.cuadra).toBe(false);
    expect(result.cuadra).toBe(false);
  });

  it('patrimonio vacío: totales en cero y cuadra', () => {
    const result = construirEvolucionPatrimonio({
      estructura: [],
      saldosInicial: [],
      saldosFinal: [],
      saldosRango: [],
    });

    expect(result.componentes).toHaveLength(0);
    expect(result.totales.saldoFinalBob.toBob()).toBe('0.00');
    expect(result.cuadra).toBe(true);
  });
});
