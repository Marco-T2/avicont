import { ClaseCuenta, SubClaseCuenta } from '@prisma/client';

import { Money } from '@/common/domain/money';

import type {
  CuentaResultadosCalculada,
  EstadoResultadosArbolResult,
  SubseccionResultadosCalculada,
} from './eeff-resultados-response.dto';
import { toEstadoResultadosResponse } from './eeff-resultados-response.dto';

// ============================================================
// Fixtures
// ============================================================

function makeCuentaResultados(
  overrides: Partial<CuentaResultadosCalculada> = {},
): CuentaResultadosCalculada {
  return {
    cuentaId: 'cuenta-1',
    codigoInterno: '4.1.1.001',
    nombre: 'Ventas',
    nivel: 4,
    esContraria: false,
    saldoBob: Money.of('1250.50'),
    ...overrides,
  };
}

function makeSubseccion(
  subClaseCuenta: SubClaseCuenta,
  cuentas: CuentaResultadosCalculada[],
  total: Money,
): SubseccionResultadosCalculada {
  return {
    subClaseCuenta,
    titulo: subClaseCuenta,
    cuentas,
    totalBob: total,
  };
}

// ============================================================
// Tests: mapper eeff-resultados-response.dto
// REQ-ER-12
// ============================================================

describe('toEstadoResultadosResponse', () => {
  const rango = {
    desde: new Date(Date.UTC(2026, 4, 1)), // 2026-05-01
    hasta: new Date(Date.UTC(2026, 4, 31)), // 2026-05-31
  };

  it('serializa Money como string con 2 decimales fijos (REQ-ER-12)', () => {
    const cuentaIngreso = makeCuentaResultados({ saldoBob: Money.of('1250.5') });
    const subseccion = makeSubseccion(
      SubClaseCuenta.INGRESO_OPERATIVO,
      [cuentaIngreso],
      Money.of('1250.5'),
    );
    const arbol: EstadoResultadosArbolResult = {
      ingreso: {
        claseCuenta: ClaseCuenta.INGRESO,
        titulo: 'Ingresos',
        subsecciones: [subseccion],
        totalBob: Money.of('1250.5'),
      },
      egreso: {
        claseCuenta: ClaseCuenta.EGRESO,
        titulo: 'Egresos',
        subsecciones: [],
        totalBob: Money.ZERO,
      },
      resultadoEjercicioBob: Money.of('1250.5'),
    };

    const result = toEstadoResultadosResponse(arbol, rango);

    expect(result.ingreso.subsecciones[0]!.cuentas[0]!.saldoBob).toBe('1250.50');
    expect(result.ingreso.subsecciones[0]!.totalBob).toBe('1250.50');
    expect(result.totalIngresoBob).toBe('1250.50');
  });

  it('resultadoEjercicioBob negativo (pérdida) serializado correctamente (REQ-ER-08)', () => {
    const arbol: EstadoResultadosArbolResult = {
      ingreso: {
        claseCuenta: ClaseCuenta.INGRESO,
        titulo: 'Ingresos',
        subsecciones: [],
        totalBob: Money.ZERO,
      },
      egreso: {
        claseCuenta: ClaseCuenta.EGRESO,
        titulo: 'Egresos',
        subsecciones: [],
        totalBob: Money.ZERO,
      },
      resultadoEjercicioBob: Money.of('-10000.00'),
    };

    const result = toEstadoResultadosResponse(arbol, rango);

    expect(result.resultadoEjercicioBob).toBe('-10000.00');
    expect(typeof result.resultadoEjercicioBob).toBe('string');
  });

  it('esGanancia=false cuando resultado es negativo (REQ-ER-08)', () => {
    const arbol: EstadoResultadosArbolResult = {
      ingreso: {
        claseCuenta: ClaseCuenta.INGRESO,
        titulo: 'Ingresos',
        subsecciones: [],
        totalBob: Money.ZERO,
      },
      egreso: {
        claseCuenta: ClaseCuenta.EGRESO,
        titulo: 'Egresos',
        subsecciones: [],
        totalBob: Money.ZERO,
      },
      resultadoEjercicioBob: Money.of('-10000.00'),
    };

    const result = toEstadoResultadosResponse(arbol, rango);

    expect(result.esGanancia).toBe(false);
  });

  it('esGanancia=true cuando resultado es positivo (REQ-ER-08)', () => {
    const arbol: EstadoResultadosArbolResult = {
      ingreso: {
        claseCuenta: ClaseCuenta.INGRESO,
        titulo: 'Ingresos',
        subsecciones: [],
        totalBob: Money.ZERO,
      },
      egreso: {
        claseCuenta: ClaseCuenta.EGRESO,
        titulo: 'Egresos',
        subsecciones: [],
        totalBob: Money.ZERO,
      },
      resultadoEjercicioBob: Money.of('15000.00'),
    };

    const result = toEstadoResultadosResponse(arbol, rango);

    expect(result.esGanancia).toBe(true);
  });

  it('esGanancia=true cuando resultado es exactamente 0 (punto de corte)', () => {
    const arbol: EstadoResultadosArbolResult = {
      ingreso: {
        claseCuenta: ClaseCuenta.INGRESO,
        titulo: 'Ingresos',
        subsecciones: [],
        totalBob: Money.ZERO,
      },
      egreso: {
        claseCuenta: ClaseCuenta.EGRESO,
        titulo: 'Egresos',
        subsecciones: [],
        totalBob: Money.ZERO,
      },
      resultadoEjercicioBob: Money.ZERO,
    };

    const result = toEstadoResultadosResponse(arbol, rango);

    expect(result.esGanancia).toBe(true);
  });

  it('fechaDesde y fechaHasta en formato "YYYY-MM-DD" en la respuesta (REQ-ER-12)', () => {
    const arbol: EstadoResultadosArbolResult = {
      ingreso: {
        claseCuenta: ClaseCuenta.INGRESO,
        titulo: 'Ingresos',
        subsecciones: [],
        totalBob: Money.ZERO,
      },
      egreso: {
        claseCuenta: ClaseCuenta.EGRESO,
        titulo: 'Egresos',
        subsecciones: [],
        totalBob: Money.ZERO,
      },
      resultadoEjercicioBob: Money.ZERO,
    };

    const result = toEstadoResultadosResponse(arbol, rango);

    expect(result.fechaDesde).toBe('2026-05-01');
    expect(result.fechaHasta).toBe('2026-05-31');
  });

  it('estructura ingreso.subsecciones[].cuentas[] correcta (REQ-ER-09, REQ-ER-12)', () => {
    const cuenta = makeCuentaResultados();
    const subseccion = makeSubseccion(
      SubClaseCuenta.INGRESO_OPERATIVO,
      [cuenta],
      Money.of('1250.50'),
    );
    const arbol: EstadoResultadosArbolResult = {
      ingreso: {
        claseCuenta: ClaseCuenta.INGRESO,
        titulo: 'Ingresos',
        subsecciones: [subseccion],
        totalBob: Money.of('1250.50'),
      },
      egreso: {
        claseCuenta: ClaseCuenta.EGRESO,
        titulo: 'Egresos',
        subsecciones: [],
        totalBob: Money.ZERO,
      },
      resultadoEjercicioBob: Money.of('1250.50'),
    };

    const result = toEstadoResultadosResponse(arbol, rango);

    expect(result.ingreso.claseCuenta).toBe('INGRESO');
    expect(result.ingreso.subsecciones).toHaveLength(1);
    expect(result.ingreso.subsecciones[0]!.subClaseCuenta).toBe('INGRESO_OPERATIVO');
    expect(result.ingreso.subsecciones[0]!.cuentas).toHaveLength(1);
    expect(result.ingreso.subsecciones[0]!.cuentas[0]!.cuentaId).toBe('cuenta-1');
  });

  it('totalIngresoBob y totalEgresoBob son atajos de ingreso/egreso.totalBob (REQ-ER-12)', () => {
    const arbol: EstadoResultadosArbolResult = {
      ingreso: {
        claseCuenta: ClaseCuenta.INGRESO,
        titulo: 'Ingresos',
        subsecciones: [],
        totalBob: Money.of('50000.00'),
      },
      egreso: {
        claseCuenta: ClaseCuenta.EGRESO,
        titulo: 'Egresos',
        subsecciones: [],
        totalBob: Money.of('35000.00'),
      },
      resultadoEjercicioBob: Money.of('15000.00'),
    };

    const result = toEstadoResultadosResponse(arbol, rango);

    expect(result.totalIngresoBob).toBe('50000.00');
    expect(result.totalEgresoBob).toBe('35000.00');
    expect(result.ingreso.totalBob).toBe('50000.00');
    expect(result.egreso.totalBob).toBe('35000.00');
  });

  it('sin línea sintética — no hay esSintetica en cuentas de resultado (diseño)', () => {
    const cuenta = makeCuentaResultados();
    const subseccion = makeSubseccion(
      SubClaseCuenta.INGRESO_OPERATIVO,
      [cuenta],
      Money.of('1250.50'),
    );
    const arbol: EstadoResultadosArbolResult = {
      ingreso: {
        claseCuenta: ClaseCuenta.INGRESO,
        titulo: 'Ingresos',
        subsecciones: [subseccion],
        totalBob: Money.of('1250.50'),
      },
      egreso: {
        claseCuenta: ClaseCuenta.EGRESO,
        titulo: 'Egresos',
        subsecciones: [],
        totalBob: Money.ZERO,
      },
      resultadoEjercicioBob: Money.of('1250.50'),
    };

    const result = toEstadoResultadosResponse(arbol, rango);

    const cuenta0 = result.ingreso.subsecciones[0]!.cuentas[0]!;
    // En el Estado de Resultados no hay líneas sintéticas — CuentaResultadosDto no tiene esSintetica
    expect('esSintetica' in cuenta0).toBe(false);
    expect(cuenta0.esContraria).toBe(false);
  });
});
