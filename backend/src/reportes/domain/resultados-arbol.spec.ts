/**
 * Tests del árbol del Estado de Resultados.
 * Función pura — cero NestJS, cero Prisma.
 * Cobertura objetivo ≥ 95% (§7.5 CLAUDE.md).
 * REQ cubiertos: REQ-ER-02, REQ-ER-05, REQ-ER-06, REQ-ER-07, REQ-ER-08, REQ-ER-09
 */

import { Decimal } from '@prisma/client/runtime/library';

import { ClaseCuenta, NaturalezaCuenta, SubClaseCuenta } from '@/common/domain/enums';

import type { CuentaEstructuraRow, SaldoCuentaRow } from '../ports/eeff-saldos-reader.port';
import { construirEstadoResultados } from './resultados-arbol';

// ============================================================
// Helpers / fixtures
// ============================================================

function makeCuentaResultados(overrides: Partial<CuentaEstructuraRow>): CuentaEstructuraRow {
  return {
    id: 'cuenta-1',
    parentId: null,
    nivel: 4,
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

function makeSaldoRango(cuentaId: string, debe: number, haber: number): SaldoCuentaRow {
  return {
    cuentaId,
    totalDebitoBob: new Decimal(debe),
    totalCreditoBob: new Decimal(haber),
  };
}

// ============================================================
// Saldo de flujo por hoja (REQ-ER-05)
// ============================================================

describe('construirEstadoResultados — saldo de flujo por hoja', () => {
  it('hoja ACREEDORA (INGRESO): saldoFlujo = credito − debito → positivo (REQ-ER-05)', () => {
    const ventas = makeCuentaResultados({
      id: 'ventas-1',
      claseCuenta: ClaseCuenta.INGRESO,
      subClaseCuenta: SubClaseCuenta.INGRESO_OPERATIVO,
      naturaleza: NaturalezaCuenta.ACREEDORA,
    });
    const saldos = [makeSaldoRango('ventas-1', 500, 20000)]; // haber > debe

    const arbol = construirEstadoResultados({ estructura: [ventas], saldosRango: saldos });

    const cuenta = arbol.ingreso.subsecciones[0]?.cuentas[0];
    expect(cuenta).toBeDefined();
    // ACREEDORA: saldo = 20000 - 500 = 19500
    expect(cuenta!.saldoBob.toBob()).toBe('19500.00');
  });

  it('hoja DEUDORA (EGRESO): saldoFlujo = debito − credito → positivo (REQ-ER-05)', () => {
    const costo = makeCuentaResultados({
      id: 'costo-1',
      claseCuenta: ClaseCuenta.EGRESO,
      subClaseCuenta: SubClaseCuenta.EGRESO_OPERATIVO,
      naturaleza: NaturalezaCuenta.DEUDORA,
    });
    const saldos = [makeSaldoRango('costo-1', 12000, 0)];

    const arbol = construirEstadoResultados({ estructura: [costo], saldosRango: saldos });

    const cuenta = arbol.egreso.subsecciones[0]?.cuentas[0];
    expect(cuenta).toBeDefined();
    // DEUDORA: saldo = 12000 - 0 = 12000
    expect(cuenta!.saldoBob.toBob()).toBe('12000.00');
  });

  it('hoja sin fila en saldosRango → Money.ZERO → omitida (REQ-ER-02, REQ-ER-07)', () => {
    // Una cuenta de INGRESO sin movimiento en el rango → flujo parte de 0, se omite
    const ventas = makeCuentaResultados({
      id: 'ventas-sin-mov',
      claseCuenta: ClaseCuenta.INGRESO,
      subClaseCuenta: SubClaseCuenta.INGRESO_OPERATIVO,
      naturaleza: NaturalezaCuenta.ACREEDORA,
    });

    // Sin saldo — no aparece en el rango (flujo puro — REQ-ER-02)
    const arbol = construirEstadoResultados({ estructura: [ventas], saldosRango: [] });

    // Con saldo 0, la cuenta se omite (REQ-ER-07)
    expect(arbol.ingreso.subsecciones).toHaveLength(0);
  });
});

// ============================================================
// Propagación jerárquica (REQ-ER-06)
// ============================================================

describe('construirEstadoResultados — propagación jerárquica', () => {
  it('árbol 3 niveles INGRESO: saldo de agrupador = suma de hojas (REQ-ER-06)', () => {
    // 4 → 4.1 → [4.1.01, 4.1.02]
    const raiz = makeCuentaResultados({
      id: 'ing-4',
      parentId: null,
      nivel: 1,
      esDetalle: false,
      claseCuenta: ClaseCuenta.INGRESO,
      subClaseCuenta: SubClaseCuenta.INGRESO_OPERATIVO,
      naturaleza: NaturalezaCuenta.ACREEDORA,
      codigoInterno: '4',
    });
    const sub41 = makeCuentaResultados({
      id: 'ing-41',
      parentId: 'ing-4',
      nivel: 2,
      esDetalle: false,
      claseCuenta: ClaseCuenta.INGRESO,
      subClaseCuenta: SubClaseCuenta.INGRESO_OPERATIVO,
      naturaleza: NaturalezaCuenta.ACREEDORA,
      codigoInterno: '4.1',
    });
    const hoja1 = makeCuentaResultados({
      id: 'ing-4101',
      parentId: 'ing-41',
      nivel: 3,
      esDetalle: true,
      claseCuenta: ClaseCuenta.INGRESO,
      subClaseCuenta: SubClaseCuenta.INGRESO_OPERATIVO,
      naturaleza: NaturalezaCuenta.ACREEDORA,
      codigoInterno: '4.1.01',
    });
    const hoja2 = makeCuentaResultados({
      id: 'ing-4102',
      parentId: 'ing-41',
      nivel: 3,
      esDetalle: true,
      claseCuenta: ClaseCuenta.INGRESO,
      subClaseCuenta: SubClaseCuenta.INGRESO_OPERATIVO,
      naturaleza: NaturalezaCuenta.ACREEDORA,
      codigoInterno: '4.1.02',
    });

    const saldos = [
      makeSaldoRango('ing-4101', 0, 20000), // haber 20000
      makeSaldoRango('ing-4102', 0, 5000), // haber 5000
    ];

    const arbol = construirEstadoResultados({
      estructura: [raiz, sub41, hoja1, hoja2],
      saldosRango: saldos,
    });

    // Debe haber una subsección INGRESO_OPERATIVO
    const subSeccion = arbol.ingreso.subsecciones.find(
      (s) => s.subClaseCuenta === SubClaseCuenta.INGRESO_OPERATIVO,
    );
    expect(subSeccion).toBeDefined();
    // El total de la subsección debe ser 25000 (20000 + 5000)
    expect(subSeccion!.totalBob.toBob()).toBe('25000.00');
    // El total de ingresos = 25000
    expect(arbol.ingreso.totalBob.toBob()).toBe('25000.00');
  });

  it('sin doble conteo: agrupador NO suma sus propios hijos más el total del sub-agrupador', () => {
    // Si raíz suma sub41, y sub41 ya propagó sus hojas, no debe duplicar.
    const sub41 = makeCuentaResultados({
      id: 'ing-41',
      parentId: null,
      nivel: 1,
      esDetalle: false,
      claseCuenta: ClaseCuenta.INGRESO,
      subClaseCuenta: SubClaseCuenta.INGRESO_OPERATIVO,
      naturaleza: NaturalezaCuenta.ACREEDORA,
      codigoInterno: '4.1',
    });
    const hoja = makeCuentaResultados({
      id: 'ing-4101',
      parentId: 'ing-41',
      nivel: 2,
      esDetalle: true,
      claseCuenta: ClaseCuenta.INGRESO,
      subClaseCuenta: SubClaseCuenta.INGRESO_OPERATIVO,
      naturaleza: NaturalezaCuenta.ACREEDORA,
      codigoInterno: '4.1.01',
    });

    const saldos = [makeSaldoRango('ing-4101', 0, 10000)];

    const arbol = construirEstadoResultados({
      estructura: [sub41, hoja],
      saldosRango: saldos,
    });

    // El total debe ser 10000, no 20000
    expect(arbol.ingreso.totalBob.toBob()).toBe('10000.00');
  });

  it('esContraria=true (devoluciones): hoja contraria RESTA del agrupador (REQ-ER-06, CRÍTICO)', () => {
    // 4.1 → [4.1.01 Ventas (30000), 4.1.02 Devoluciones (esContraria=true, 2000)]
    const sub41 = makeCuentaResultados({
      id: 'ing-41',
      parentId: null,
      nivel: 1,
      esDetalle: false,
      claseCuenta: ClaseCuenta.INGRESO,
      subClaseCuenta: SubClaseCuenta.INGRESO_OPERATIVO,
      naturaleza: NaturalezaCuenta.ACREEDORA,
      codigoInterno: '4.1',
    });
    const ventas = makeCuentaResultados({
      id: 'ing-ventas',
      parentId: 'ing-41',
      nivel: 2,
      esDetalle: true,
      esContraria: false,
      claseCuenta: ClaseCuenta.INGRESO,
      subClaseCuenta: SubClaseCuenta.INGRESO_OPERATIVO,
      naturaleza: NaturalezaCuenta.ACREEDORA,
      codigoInterno: '4.1.01',
    });
    const devoluciones = makeCuentaResultados({
      id: 'ing-devoluciones',
      parentId: 'ing-41',
      nivel: 2,
      esDetalle: true,
      esContraria: true, // CRÍTICO: devoluciones restan del ingreso
      claseCuenta: ClaseCuenta.INGRESO,
      subClaseCuenta: SubClaseCuenta.INGRESO_OPERATIVO,
      naturaleza: NaturalezaCuenta.ACREEDORA,
      codigoInterno: '4.1.02',
    });

    const saldos = [
      makeSaldoRango('ing-ventas', 0, 30000),
      makeSaldoRango('ing-devoluciones', 0, 2000),
    ];

    const arbol = construirEstadoResultados({
      estructura: [sub41, ventas, devoluciones],
      saldosRango: saldos,
    });

    // 4.1 debe ser 30000 - 2000 = 28000
    expect(arbol.ingreso.totalBob.toBob()).toBe('28000.00');

    // La cuenta contraria debe aparecer marcada con esContraria=true
    const subSeccion = arbol.ingreso.subsecciones[0];
    expect(subSeccion).toBeDefined();
    const devolucionesDto = subSeccion!.cuentas.find((c) => c.cuentaId === 'ing-devoluciones');
    expect(devolucionesDto).toBeDefined();
    expect(devolucionesDto!.esContraria).toBe(true);
  });

  it('grupo sin cuentas contrarias → todos los saldos suman normalmente (REQ-ER-06)', () => {
    const agrupador = makeCuentaResultados({
      id: 'egr-51',
      parentId: null,
      nivel: 1,
      esDetalle: false,
      claseCuenta: ClaseCuenta.EGRESO,
      subClaseCuenta: SubClaseCuenta.EGRESO_OPERATIVO,
      naturaleza: NaturalezaCuenta.DEUDORA,
      codigoInterno: '5.1',
    });
    const costoVentas = makeCuentaResultados({
      id: 'egr-costo',
      parentId: 'egr-51',
      nivel: 2,
      esDetalle: true,
      esContraria: false,
      claseCuenta: ClaseCuenta.EGRESO,
      subClaseCuenta: SubClaseCuenta.EGRESO_OPERATIVO,
      naturaleza: NaturalezaCuenta.DEUDORA,
      codigoInterno: '5.1.01',
    });
    const gastosAdm = makeCuentaResultados({
      id: 'egr-adm',
      parentId: 'egr-51',
      nivel: 2,
      esDetalle: true,
      esContraria: false,
      claseCuenta: ClaseCuenta.EGRESO,
      subClaseCuenta: SubClaseCuenta.EGRESO_OPERATIVO,
      naturaleza: NaturalezaCuenta.DEUDORA,
      codigoInterno: '5.1.02',
    });

    const saldos = [makeSaldoRango('egr-costo', 15000, 0), makeSaldoRango('egr-adm', 8000, 0)];

    const arbol = construirEstadoResultados({
      estructura: [agrupador, costoVentas, gastosAdm],
      saldosRango: saldos,
    });

    expect(arbol.egreso.totalBob.toBob()).toBe('23000.00');
  });
});

// ============================================================
// Omisión saldo 0 (REQ-ER-07)
// ============================================================

describe('construirEstadoResultados — omisión saldo 0 (REQ-ER-07)', () => {
  it('hoja con saldo de flujo 0 → omitida del reporte', () => {
    const cuentaSinMov = makeCuentaResultados({
      id: 'egr-dep',
      claseCuenta: ClaseCuenta.EGRESO,
      subClaseCuenta: SubClaseCuenta.EGRESO_OPERATIVO,
      naturaleza: NaturalezaCuenta.DEUDORA,
      codigoInterno: '5.2.01',
    });

    const arbol = construirEstadoResultados({ estructura: [cuentaSinMov], saldosRango: [] });

    expect(arbol.egreso.subsecciones).toHaveLength(0);
  });

  it('agrupador con todos los hijos en 0 → omitido', () => {
    const agrupador = makeCuentaResultados({
      id: 'egr-53',
      parentId: null,
      nivel: 1,
      esDetalle: false,
      claseCuenta: ClaseCuenta.EGRESO,
      subClaseCuenta: SubClaseCuenta.EGRESO_FINANCIERO,
      naturaleza: NaturalezaCuenta.DEUDORA,
      codigoInterno: '5.3',
    });
    const hija = makeCuentaResultados({
      id: 'egr-531',
      parentId: 'egr-53',
      nivel: 2,
      esDetalle: true,
      claseCuenta: ClaseCuenta.EGRESO,
      subClaseCuenta: SubClaseCuenta.EGRESO_FINANCIERO,
      naturaleza: NaturalezaCuenta.DEUDORA,
      codigoInterno: '5.3.01',
    });

    // Sin saldo en el rango — flujo cero
    const arbol = construirEstadoResultados({
      estructura: [agrupador, hija],
      saldosRango: [],
    });

    expect(arbol.egreso.subsecciones).toHaveLength(0);
  });

  it('agrupador con ≥1 hijo ≠ 0 → presente aunque tenga otros hijos en 0', () => {
    const agrupador = makeCuentaResultados({
      id: 'egr-51',
      parentId: null,
      nivel: 1,
      esDetalle: false,
      claseCuenta: ClaseCuenta.EGRESO,
      subClaseCuenta: SubClaseCuenta.EGRESO_OPERATIVO,
      naturaleza: NaturalezaCuenta.DEUDORA,
      codigoInterno: '5.1',
    });
    const hijaConSaldo = makeCuentaResultados({
      id: 'egr-511',
      parentId: 'egr-51',
      nivel: 2,
      esDetalle: true,
      claseCuenta: ClaseCuenta.EGRESO,
      subClaseCuenta: SubClaseCuenta.EGRESO_OPERATIVO,
      naturaleza: NaturalezaCuenta.DEUDORA,
      codigoInterno: '5.1.01',
    });
    const hijaSinSaldo = makeCuentaResultados({
      id: 'egr-512',
      parentId: 'egr-51',
      nivel: 2,
      esDetalle: true,
      claseCuenta: ClaseCuenta.EGRESO,
      subClaseCuenta: SubClaseCuenta.EGRESO_OPERATIVO,
      naturaleza: NaturalezaCuenta.DEUDORA,
      codigoInterno: '5.1.02',
    });

    const saldos = [makeSaldoRango('egr-511', 5000, 0)]; // solo una con saldo

    const arbol = construirEstadoResultados({
      estructura: [agrupador, hijaConSaldo, hijaSinSaldo],
      saldosRango: saldos,
    });

    // Debe aparecer la subsección (tiene una hija con saldo)
    expect(arbol.egreso.subsecciones).toHaveLength(1);
    // Solo la hija con saldo aparece
    const sub = arbol.egreso.subsecciones[0]!;
    const cuentaIds = sub.cuentas.map((c) => c.cuentaId);
    expect(cuentaIds).toContain('egr-511');
    expect(cuentaIds).not.toContain('egr-512');
  });
});

// ============================================================
// Resultado del Ejercicio (REQ-ER-08)
// ============================================================

describe('construirEstadoResultados — Resultado del Ejercicio (REQ-ER-08)', () => {
  it('ResultadoEjercicio = Σ INGRESO − Σ EGRESO correcto con fixture', () => {
    // Ingresos 50000, Egresos 35000 → Resultado 15000
    const ventas = makeCuentaResultados({
      id: 'ventas',
      claseCuenta: ClaseCuenta.INGRESO,
      subClaseCuenta: SubClaseCuenta.INGRESO_OPERATIVO,
      naturaleza: NaturalezaCuenta.ACREEDORA,
      codigoInterno: '4.1.01',
    });
    const costos = makeCuentaResultados({
      id: 'costos',
      claseCuenta: ClaseCuenta.EGRESO,
      subClaseCuenta: SubClaseCuenta.EGRESO_OPERATIVO,
      naturaleza: NaturalezaCuenta.DEUDORA,
      codigoInterno: '5.1.01',
    });

    const saldos = [
      makeSaldoRango('ventas', 0, 50000), // ACREEDORA: 50000
      makeSaldoRango('costos', 35000, 0), // DEUDORA: 35000
    ];

    const arbol = construirEstadoResultados({
      estructura: [ventas, costos],
      saldosRango: saldos,
    });

    // Código Tributario art. 47: ResultadoEjercicio = Σ Ingresos − Σ Egresos del período.
    expect(arbol.resultadoEjercicioBob.toBob()).toBe('15000.00');
  });

  it('resultado negativo (pérdida): resultadoEjercicioBob como Money negativo', () => {
    const ventas = makeCuentaResultados({
      id: 'ventas',
      claseCuenta: ClaseCuenta.INGRESO,
      subClaseCuenta: SubClaseCuenta.INGRESO_OPERATIVO,
      naturaleza: NaturalezaCuenta.ACREEDORA,
      codigoInterno: '4.1.01',
    });
    const costos = makeCuentaResultados({
      id: 'costos',
      claseCuenta: ClaseCuenta.EGRESO,
      subClaseCuenta: SubClaseCuenta.EGRESO_OPERATIVO,
      naturaleza: NaturalezaCuenta.DEUDORA,
      codigoInterno: '5.1.01',
    });

    const saldos = [
      makeSaldoRango('ventas', 0, 20000), // ACREEDORA: 20000
      makeSaldoRango('costos', 30000, 0), // DEUDORA: 30000
    ];

    const arbol = construirEstadoResultados({
      estructura: [ventas, costos],
      saldosRango: saldos,
    });

    expect(arbol.resultadoEjercicioBob.toBob()).toBe('-10000.00');
  });

  it('cuentas ACTIVO/PASIVO/PATRIMONIO son ignoradas — no afectan el Resultado', () => {
    const cuentaActivo = makeCuentaResultados({
      id: 'activo-caja',
      claseCuenta: ClaseCuenta.ACTIVO,
      subClaseCuenta: SubClaseCuenta.ACTIVO_CORRIENTE,
      naturaleza: NaturalezaCuenta.DEUDORA,
      codigoInterno: '1.1.01',
    });
    const ventas = makeCuentaResultados({
      id: 'ventas',
      claseCuenta: ClaseCuenta.INGRESO,
      subClaseCuenta: SubClaseCuenta.INGRESO_OPERATIVO,
      naturaleza: NaturalezaCuenta.ACREEDORA,
      codigoInterno: '4.1.01',
    });

    const saldos = [
      makeSaldoRango('activo-caja', 5000, 0), // ACTIVO — debe ignorarse
      makeSaldoRango('ventas', 0, 10000), // INGRESO
    ];

    const arbol = construirEstadoResultados({
      estructura: [cuentaActivo, ventas],
      saldosRango: saldos,
    });

    // El Resultado es solo 10000 (Ingreso) − 0 (Egreso) = 10000
    // El activo no debe aparecer ni contribuir
    expect(arbol.resultadoEjercicioBob.toBob()).toBe('10000.00');
    // ACTIVO no está en ingreso ni egreso
    const todasLasCuentas = [
      ...arbol.ingreso.subsecciones.flatMap((s) => s.cuentas),
      ...arbol.egreso.subsecciones.flatMap((s) => s.cuentas),
    ];
    expect(todasLasCuentas.find((c) => c.cuentaId === 'activo-caja')).toBeUndefined();
  });
});

// ============================================================
// Estructura dos secciones (REQ-ER-09)
// ============================================================

describe('construirEstadoResultados — estructura árbol Ingreso/Egreso (REQ-ER-09)', () => {
  it('respuesta contiene secciones "ingreso" y "egreso" como claves', () => {
    const arbol = construirEstadoResultados({ estructura: [], saldosRango: [] });

    expect(arbol.ingreso).toBeDefined();
    expect(arbol.egreso).toBeDefined();
    expect(arbol.ingreso.claseCuenta).toBe(ClaseCuenta.INGRESO);
    expect(arbol.egreso.claseCuenta).toBe(ClaseCuenta.EGRESO);
  });

  it('solo subsecciones con descendientes de saldo ≠ 0 aparecen (REQ-ER-09)', () => {
    const ventasOp = makeCuentaResultados({
      id: 'ing-op',
      claseCuenta: ClaseCuenta.INGRESO,
      subClaseCuenta: SubClaseCuenta.INGRESO_OPERATIVO,
      naturaleza: NaturalezaCuenta.ACREEDORA,
    });
    const ingNoOp = makeCuentaResultados({
      id: 'ing-no-op',
      claseCuenta: ClaseCuenta.INGRESO,
      subClaseCuenta: SubClaseCuenta.INGRESO_NO_OPERATIVO,
      naturaleza: NaturalezaCuenta.ACREEDORA,
    });

    // Solo INGRESO_OPERATIVO tiene saldo
    const saldos = [makeSaldoRango('ing-op', 0, 5000)];

    const arbol = construirEstadoResultados({
      estructura: [ventasOp, ingNoOp],
      saldosRango: saldos,
    });

    expect(arbol.ingreso.subsecciones).toHaveLength(1);
    expect(arbol.ingreso.subsecciones[0]!.subClaseCuenta).toBe(SubClaseCuenta.INGRESO_OPERATIVO);
  });

  it('orden por codigoInterno ASC dentro de cada subsección (REQ-ER-09)', () => {
    const ventas2 = makeCuentaResultados({
      id: 'ing-4102',
      claseCuenta: ClaseCuenta.INGRESO,
      subClaseCuenta: SubClaseCuenta.INGRESO_OPERATIVO,
      naturaleza: NaturalezaCuenta.ACREEDORA,
      codigoInterno: '4.1.02',
    });
    const ventas1 = makeCuentaResultados({
      id: 'ing-4101',
      claseCuenta: ClaseCuenta.INGRESO,
      subClaseCuenta: SubClaseCuenta.INGRESO_OPERATIVO,
      naturaleza: NaturalezaCuenta.ACREEDORA,
      codigoInterno: '4.1.01',
    });

    const saldos = [makeSaldoRango('ing-4102', 0, 3000), makeSaldoRango('ing-4101', 0, 7000)];

    const arbol = construirEstadoResultados({
      estructura: [ventas2, ventas1], // orden inverso
      saldosRango: saldos,
    });

    const cuentas = arbol.ingreso.subsecciones[0]!.cuentas;
    // La de código menor debe ir primero
    expect(cuentas[0]!.codigoInterno).toBe('4.1.01');
    expect(cuentas[1]!.codigoInterno).toBe('4.1.02');
  });

  it('tenant sin movimientos → ingreso y egreso con totalBob "0.00" y resultadoEjercicio "0.00"', () => {
    const arbol = construirEstadoResultados({ estructura: [], saldosRango: [] });

    expect(arbol.ingreso.totalBob.toBob()).toBe('0.00');
    expect(arbol.egreso.totalBob.toBob()).toBe('0.00');
    expect(arbol.resultadoEjercicioBob.toBob()).toBe('0.00');
  });
});
