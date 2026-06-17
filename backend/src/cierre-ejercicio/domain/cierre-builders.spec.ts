import { ClaseCuenta, NaturalezaCuenta } from '@/common/domain/enums';
import { Money } from '@/common/domain/money';

import {
  buildCerrarGastos,
  buildCerrarIngresos,
  buildTrasladarResultado,
  verificarPartidaDoble,
  type LineaCierre,
  type SaldoCuentaCierre,
} from './cierre-builders';
import { CierrePartidaDobleError } from './cierre-errors';

const TRANSITORIA = 'cta-3.1.4.001';
const RESULTADOS_ACUMULADOS = 'cta-3.1.3.001';
const YEAR = 2026;

function egreso(cuentaId: string, debitoBob: string, creditoBob: string): SaldoCuentaCierre {
  return {
    cuentaId,
    clase: ClaseCuenta.EGRESO,
    naturaleza: NaturalezaCuenta.DEUDORA,
    debitoBob: Money.of(debitoBob),
    creditoBob: Money.of(creditoBob),
  };
}

function ingreso(cuentaId: string, debitoBob: string, creditoBob: string): SaldoCuentaCierre {
  return {
    cuentaId,
    clase: ClaseCuenta.INGRESO,
    naturaleza: NaturalezaCuenta.ACREEDORA,
    debitoBob: Money.of(debitoBob),
    creditoBob: Money.of(creditoBob),
  };
}

function lineaDe(asientoLineas: LineaCierre[], cuentaId: string): LineaCierre {
  const linea = asientoLineas.find((l) => l.cuentaId === cuentaId);
  if (linea === undefined) {
    throw new Error(`linea no encontrada para ${cuentaId}`);
  }
  return linea;
}

function sumaDebe(lineas: LineaCierre[]): Money {
  return lineas.reduce((acc, l) => acc.plus(l.debito), Money.ZERO);
}

function sumaHaber(lineas: LineaCierre[]): Money {
  return lineas.reduce((acc, l) => acc.plus(l.credito), Money.ZERO);
}

describe('buildCerrarGastos (#1)', () => {
  it('cierra gastos normales acreditándolos y debita la transitoria por Σ|net|', () => {
    const asiento = buildCerrarGastos(
      [egreso('costo', '60000.00', '0.00'), egreso('sueldos', '20000.00', '0.00')],
      TRANSITORIA,
      YEAR,
    );

    // gastos al HABER
    expect(lineaDe(asiento.lineas, 'costo').credito.toBob()).toBe('60000.00');
    expect(lineaDe(asiento.lineas, 'costo').debito.toBob()).toBe('0.00');
    expect(lineaDe(asiento.lineas, 'sueldos').credito.toBob()).toBe('20000.00');
    // contrapartida transitoria al DEBE por Σ
    expect(lineaDe(asiento.lineas, TRANSITORIA).debito.toBob()).toBe('80000.00');
    expect(lineaDe(asiento.lineas, TRANSITORIA).credito.toBob()).toBe('0.00');
    // partida doble
    expect(sumaDebe(asiento.lineas).balanceadoEnBobCon(sumaHaber(asiento.lineas))).toBe(true);
    expect(asiento.lineas).toHaveLength(3);
    expect(asiento.glosa).toContain('2026');
  });

  it('cuenta EGRESO con saldo contrario (net<0) → línea al DEBE; el asiento sigue cuadrando', () => {
    const asiento = buildCerrarGastos([egreso('anomala', '0.00', '500.00')], TRANSITORIA, YEAR);

    // net = −500 → mismo lado que naturaleza (DEBE)
    expect(lineaDe(asiento.lineas, 'anomala').debito.toBob()).toBe('500.00');
    expect(lineaDe(asiento.lineas, 'anomala').credito.toBob()).toBe('0.00');
    // la transitoria contrarresta al HABER para cuadrar
    expect(lineaDe(asiento.lineas, TRANSITORIA).credito.toBob()).toBe('500.00');
    expect(sumaDebe(asiento.lineas).balanceadoEnBobCon(sumaHaber(asiento.lineas))).toBe(true);
  });

  it('omite cuentas con net===0 y devuelve lineas:[] si no quedó ninguna (SKIP)', () => {
    const asiento = buildCerrarGastos([egreso('neutra', '1000.00', '1000.00')], TRANSITORIA, YEAR);
    expect(asiento.lineas).toEqual([]);
  });

  it('sin cuentas EGRESO con movimiento → lineas:[] (SKIP)', () => {
    const asiento = buildCerrarGastos([], TRANSITORIA, YEAR);
    expect(asiento.lineas).toEqual([]);
  });
});

describe('buildCerrarIngresos (#2)', () => {
  it('cierra ingresos normales debitándolos y acredita la transitoria por Σ|net|', () => {
    const asiento = buildCerrarIngresos(
      [ingreso('ventas', '0.00', '100000.00')],
      TRANSITORIA,
      YEAR,
    );

    expect(lineaDe(asiento.lineas, 'ventas').debito.toBob()).toBe('100000.00');
    expect(lineaDe(asiento.lineas, 'ventas').credito.toBob()).toBe('0.00');
    expect(lineaDe(asiento.lineas, TRANSITORIA).credito.toBob()).toBe('100000.00');
    expect(lineaDe(asiento.lineas, TRANSITORIA).debito.toBob()).toBe('0.00');
    expect(sumaDebe(asiento.lineas).balanceadoEnBobCon(sumaHaber(asiento.lineas))).toBe(true);
    expect(asiento.lineas).toHaveLength(2);
  });

  it('cuenta INGRESO con saldo contrario (net<0) → línea al HABER', () => {
    const asiento = buildCerrarIngresos([ingreso('anomala', '700.00', '0.00')], TRANSITORIA, YEAR);
    expect(lineaDe(asiento.lineas, 'anomala').credito.toBob()).toBe('700.00');
    expect(lineaDe(asiento.lineas, TRANSITORIA).debito.toBob()).toBe('700.00');
    expect(sumaDebe(asiento.lineas).balanceadoEnBobCon(sumaHaber(asiento.lineas))).toBe(true);
  });

  it('sin cuentas INGRESO con movimiento → lineas:[] (SKIP)', () => {
    const asiento = buildCerrarIngresos([], TRANSITORIA, YEAR);
    expect(asiento.lineas).toEqual([]);
  });
});

describe('buildTrasladarResultado (#3)', () => {
  it('resultado positivo (utilidad): DEBE transitoria / HABER Resultados Acumulados', () => {
    const asiento = buildTrasladarResultado(
      Money.of('20000.00'),
      TRANSITORIA,
      RESULTADOS_ACUMULADOS,
      YEAR,
    );

    expect(lineaDe(asiento.lineas, TRANSITORIA).debito.toBob()).toBe('20000.00');
    expect(lineaDe(asiento.lineas, TRANSITORIA).credito.toBob()).toBe('0.00');
    expect(lineaDe(asiento.lineas, RESULTADOS_ACUMULADOS).credito.toBob()).toBe('20000.00');
    expect(lineaDe(asiento.lineas, RESULTADOS_ACUMULADOS).debito.toBob()).toBe('0.00');
    expect(sumaDebe(asiento.lineas).balanceadoEnBobCon(sumaHaber(asiento.lineas))).toBe(true);
    expect(asiento.lineas).toHaveLength(2);
  });

  it('resultado negativo (pérdida): DEBE Resultados Acumulados / HABER transitoria por |resultado|', () => {
    const asiento = buildTrasladarResultado(
      Money.of('-20000.00'),
      TRANSITORIA,
      RESULTADOS_ACUMULADOS,
      YEAR,
    );

    expect(lineaDe(asiento.lineas, RESULTADOS_ACUMULADOS).debito.toBob()).toBe('20000.00');
    expect(lineaDe(asiento.lineas, TRANSITORIA).credito.toBob()).toBe('20000.00');
    expect(lineaDe(asiento.lineas, TRANSITORIA).debito.toBob()).toBe('0.00');
    expect(sumaDebe(asiento.lineas).balanceadoEnBobCon(sumaHaber(asiento.lineas))).toBe(true);
  });

  it('resultado 0 → lineas:[] (SKIP-on-zero)', () => {
    const asiento = buildTrasladarResultado(
      Money.of('0.00'),
      TRANSITORIA,
      RESULTADOS_ACUMULADOS,
      YEAR,
    );
    expect(asiento.lineas).toEqual([]);
  });
});

describe('Caso numérico completo del design §3.4 — UTILIDAD', () => {
  // Ventas 100.000, Costo 60.000, Sueldos 20.000 → utilidad 20.000
  const gastos = [egreso('costo', '60000.00', '0.00'), egreso('sueldos', '20000.00', '0.00')];
  const ingresos = [ingreso('ventas', '0.00', '100000.00')];

  it('#1 cierra gastos: HABER costo 60000 + HABER sueldos 20000, DEBE transitoria 80000', () => {
    const a1 = buildCerrarGastos(gastos, TRANSITORIA, YEAR);
    expect(lineaDe(a1.lineas, 'costo').credito.toBob()).toBe('60000.00');
    expect(lineaDe(a1.lineas, 'sueldos').credito.toBob()).toBe('20000.00');
    expect(lineaDe(a1.lineas, TRANSITORIA).debito.toBob()).toBe('80000.00');
  });

  it('#2 cierra ingresos: DEBE ventas 100000, HABER transitoria 100000', () => {
    const a2 = buildCerrarIngresos(ingresos, TRANSITORIA, YEAR);
    expect(lineaDe(a2.lineas, 'ventas').debito.toBob()).toBe('100000.00');
    expect(lineaDe(a2.lineas, TRANSITORIA).credito.toBob()).toBe('100000.00');
  });

  it('#3 traslada utilidad 20000: DEBE transitoria 20000, HABER Resultados Acumulados 20000', () => {
    // resultado = Σingresos − Σgastos = 100000 − 80000 = +20000
    const a3 = buildTrasladarResultado(
      Money.of('20000.00'),
      TRANSITORIA,
      RESULTADOS_ACUMULADOS,
      YEAR,
    );
    expect(lineaDe(a3.lineas, TRANSITORIA).debito.toBob()).toBe('20000.00');
    expect(lineaDe(a3.lineas, RESULTADOS_ACUMULADOS).credito.toBob()).toBe('20000.00');
  });
});

describe('Caso numérico completo del design §3.5 — PÉRDIDA', () => {
  // Ventas 50.000, Costo 70.000 → pérdida −20.000
  const gastos = [egreso('costo', '70000.00', '0.00')];
  const ingresos = [ingreso('ventas', '0.00', '50000.00')];

  it('#1 cierra gastos: HABER costo 70000, DEBE transitoria 70000', () => {
    const a1 = buildCerrarGastos(gastos, TRANSITORIA, YEAR);
    expect(lineaDe(a1.lineas, 'costo').credito.toBob()).toBe('70000.00');
    expect(lineaDe(a1.lineas, TRANSITORIA).debito.toBob()).toBe('70000.00');
  });

  it('#2 cierra ingresos: DEBE ventas 50000, HABER transitoria 50000', () => {
    const a2 = buildCerrarIngresos(ingresos, TRANSITORIA, YEAR);
    expect(lineaDe(a2.lineas, 'ventas').debito.toBob()).toBe('50000.00');
    expect(lineaDe(a2.lineas, TRANSITORIA).credito.toBob()).toBe('50000.00');
  });

  it('#3 traslada pérdida −20000: DEBE Resultados Acumulados 20000, HABER transitoria 20000', () => {
    const a3 = buildTrasladarResultado(
      Money.of('-20000.00'),
      TRANSITORIA,
      RESULTADOS_ACUMULADOS,
      YEAR,
    );
    expect(lineaDe(a3.lineas, RESULTADOS_ACUMULADOS).debito.toBob()).toBe('20000.00');
    expect(lineaDe(a3.lineas, TRANSITORIA).credito.toBob()).toBe('20000.00');
  });
});

describe('Defensa de partida doble (bug de dominio)', () => {
  it('verificarPartidaDoble lanza CierrePartidaDobleError ante líneas desbalanceadas', () => {
    // Los builders SIEMPRE cuadran por construcción; la guarda se ejercita directo
    // con un descuadre forzado (Σdebe 80000 ≠ Σhaber 79000).
    const lineasDesbalanceadas: LineaCierre[] = [
      { cuentaId: 'a', debito: Money.of('80000.00'), credito: Money.ZERO },
      { cuentaId: 'b', debito: Money.ZERO, credito: Money.of('79000.00') },
    ];
    expect(() => verificarPartidaDoble(lineasDesbalanceadas)).toThrow(CierrePartidaDobleError);
  });

  it('verificarPartidaDoble NO lanza dentro de la tolerancia ±Bs 0.01', () => {
    const lineasEnTolerancia: LineaCierre[] = [
      { cuentaId: 'a', debito: Money.of('80000.01'), credito: Money.ZERO },
      { cuentaId: 'b', debito: Money.ZERO, credito: Money.of('80000.00') },
    ];
    expect(() => verificarPartidaDoble(lineasEnTolerancia)).not.toThrow();
  });
});
