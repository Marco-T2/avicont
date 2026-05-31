import { ClaseCuenta, NaturalezaCuenta, SubClaseCuenta } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

import { construirBalance } from './balance-arbol';
import type { CuentaEstructuraRow, SaldoCuentaRow } from '../ports/balance-reader.port';

// ============================================================
// Fixtures
// ============================================================

function makeCuenta(overrides: Partial<CuentaEstructuraRow> = {}): CuentaEstructuraRow {
  return {
    id: 'cuenta-1',
    parentId: null,
    nivel: 1,
    esDetalle: true,
    esContraria: false,
    claseCuenta: ClaseCuenta.ACTIVO,
    subClaseCuenta: SubClaseCuenta.ACTIVO_CORRIENTE,
    naturaleza: NaturalezaCuenta.DEUDORA,
    codigoInterno: '1.1.1.001',
    nombre: 'Caja MN',
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

// ============================================================
// Saldo neto de hoja (REQ-BG-05)
// ============================================================

describe('construirBalance — saldo neto de hoja', () => {
  it('hoja DEUDORA: saldo = debe − haber (positivo)', () => {
    const cuenta = makeCuenta({ id: 'c1', esDetalle: true, naturaleza: NaturalezaCuenta.DEUDORA });
    const saldos = [makeSaldo('c1', '5000.00', '1200.00')];

    const result = construirBalance({
      estructura: [cuenta],
      saldosHasta: saldos,
      saldosGestion: [],
    });

    const cuentaEnArbol = result.activo.subsecciones[0]?.cuentas[0];
    expect(cuentaEnArbol).toBeDefined();
    expect(cuentaEnArbol!.saldoBob.toBob()).toBe('3800.00');
  });

  it('hoja ACREEDORA: saldo = haber − debe (positivo)', () => {
    const cuenta = makeCuenta({
      id: 'c1',
      esDetalle: true,
      naturaleza: NaturalezaCuenta.ACREEDORA,
      claseCuenta: ClaseCuenta.PASIVO,
      subClaseCuenta: SubClaseCuenta.PASIVO_CORRIENTE,
    });
    const saldos = [makeSaldo('c1', '200.00', '800.00')];

    const result = construirBalance({
      estructura: [cuenta],
      saldosHasta: saldos,
      saldosGestion: [],
    });

    const cuentaEnArbol = result.pasivo.subsecciones[0]?.cuentas[0];
    expect(cuentaEnArbol).toBeDefined();
    expect(cuentaEnArbol!.saldoBob.toBob()).toBe('600.00');
  });

  it('hoja sin fila en saldos → saldo = 0, excluida del reporte (REQ-BG-08)', () => {
    const cuenta = makeCuenta({ id: 'c1', esDetalle: true });

    const result = construirBalance({ estructura: [cuenta], saldosHasta: [], saldosGestion: [] });

    expect(result.activo.subsecciones).toHaveLength(0);
  });
});

// ============================================================
// Propagación jerárquica (REQ-BG-06, REQ-BG-06b)
// ============================================================

describe('construirBalance — propagación jerárquica', () => {
  it('árbol 3 niveles: saldo agrupador = suma de hojas', () => {
    // Árbol: 1 (agrupador raíz) → 1.1 (agrupador) → [1.1.01, 1.1.02] (hojas)
    const raiz = makeCuenta({
      id: 'raiz',
      parentId: null,
      nivel: 1,
      esDetalle: false,
      codigoInterno: '1',
      nombre: 'Activo',
      subClaseCuenta: SubClaseCuenta.ACTIVO_CORRIENTE,
    });
    const agrupador = makeCuenta({
      id: 'agrup',
      parentId: 'raiz',
      nivel: 2,
      esDetalle: false,
      codigoInterno: '1.1',
      nombre: 'Activo Corriente',
      subClaseCuenta: SubClaseCuenta.ACTIVO_CORRIENTE,
    });
    const hoja1 = makeCuenta({
      id: 'h1',
      parentId: 'agrup',
      nivel: 3,
      esDetalle: true,
      codigoInterno: '1.1.01',
      nombre: 'Caja',
      subClaseCuenta: SubClaseCuenta.ACTIVO_CORRIENTE,
    });
    const hoja2 = makeCuenta({
      id: 'h2',
      parentId: 'agrup',
      nivel: 3,
      esDetalle: true,
      codigoInterno: '1.1.02',
      nombre: 'Bancos',
      subClaseCuenta: SubClaseCuenta.ACTIVO_CORRIENTE,
    });

    const saldos = [makeSaldo('h1', '3000.00', '0.00'), makeSaldo('h2', '2000.00', '0.00')];

    const result = construirBalance({
      estructura: [raiz, agrupador, hoja1, hoja2],
      saldosHasta: saldos,
      saldosGestion: [],
    });

    // El total del activo debe ser 5000
    expect(result.activo.totalBob.toBob()).toBe('5000.00');
  });

  it('árbol 4 niveles: sin doble conteo (REQ-BG-06b)', () => {
    // Árbol: nivel1 → nivel2 → nivel3 → nivel4 (hoja)
    // El nivel1 NO debe contar nivel2 + nivel3 + nivel4 por separado
    const n1 = makeCuenta({
      id: 'n1',
      parentId: null,
      nivel: 1,
      esDetalle: false,
      codigoInterno: '1',
      subClaseCuenta: SubClaseCuenta.ACTIVO_CORRIENTE,
    });
    const n2 = makeCuenta({
      id: 'n2',
      parentId: 'n1',
      nivel: 2,
      esDetalle: false,
      codigoInterno: '1.1',
      subClaseCuenta: SubClaseCuenta.ACTIVO_CORRIENTE,
    });
    const n3 = makeCuenta({
      id: 'n3',
      parentId: 'n2',
      nivel: 3,
      esDetalle: false,
      codigoInterno: '1.1.1',
      subClaseCuenta: SubClaseCuenta.ACTIVO_CORRIENTE,
    });
    const hoja = makeCuenta({
      id: 'hoja',
      parentId: 'n3',
      nivel: 4,
      esDetalle: true,
      codigoInterno: '1.1.1.001',
      subClaseCuenta: SubClaseCuenta.ACTIVO_CORRIENTE,
    });

    const saldos = [makeSaldo('hoja', '1000.00', '0.00')];

    const result = construirBalance({
      estructura: [n1, n2, n3, hoja],
      saldosHasta: saldos,
      saldosGestion: [],
    });

    // Debe ser exactamente 1000 (no 4000 por contar cada nivel)
    expect(result.activo.totalBob.toBob()).toBe('1000.00');
  });
});

// ============================================================
// esContraria (REQ-BG-07, CRÍTICO)
// ============================================================

describe('construirBalance — esContraria resta del grupo', () => {
  it('Depreciación Acumulada ACREEDORA con esContraria=true resta del Activo No Corriente', () => {
    // Equipo: ACTIVO_NO_CORRIENTE, DEUDORA, saldo 10000
    // Depreciación Acumulada: ACTIVO_NO_CORRIENTE, ACREEDORA, esContraria=true, saldo 2000
    // Resultado esperado del grupo: 10000 − 2000 = 8000
    const equipo = makeCuenta({
      id: 'equipo',
      parentId: 'grupo-anc',
      nivel: 3,
      esDetalle: true,
      esContraria: false,
      naturaleza: NaturalezaCuenta.DEUDORA,
      claseCuenta: ClaseCuenta.ACTIVO,
      subClaseCuenta: SubClaseCuenta.ACTIVO_NO_CORRIENTE,
      codigoInterno: '1.2.1.001',
      nombre: 'Equipos',
    });
    const depreciacion = makeCuenta({
      id: 'dep',
      parentId: 'grupo-anc',
      nivel: 3,
      esDetalle: true,
      esContraria: true, // CRÍTICO
      naturaleza: NaturalezaCuenta.ACREEDORA, // contra-activo
      claseCuenta: ClaseCuenta.ACTIVO,
      subClaseCuenta: SubClaseCuenta.ACTIVO_NO_CORRIENTE,
      codigoInterno: '1.2.1.002',
      nombre: 'Depreciación Acumulada Equipos',
    });
    const grupoAnc = makeCuenta({
      id: 'grupo-anc',
      parentId: null,
      nivel: 2,
      esDetalle: false,
      esContraria: false,
      naturaleza: NaturalezaCuenta.DEUDORA,
      claseCuenta: ClaseCuenta.ACTIVO,
      subClaseCuenta: SubClaseCuenta.ACTIVO_NO_CORRIENTE,
      codigoInterno: '1.2',
      nombre: 'Activo No Corriente',
    });

    const saldos = [
      makeSaldo('equipo', '10000.00', '0.00'), // saldo neto DEUDORA = 10000
      makeSaldo('dep', '0.00', '2000.00'), // saldo neto ACREEDORA = 2000
    ];

    const result = construirBalance({
      estructura: [grupoAnc, equipo, depreciacion],
      saldosHasta: saldos,
      saldosGestion: [],
    });

    // El Activo No Corriente total debe ser 10000 - 2000 = 8000
    expect(result.activo.totalBob.toBob()).toBe('8000.00');
  });

  it('cuenta esContraria=true con saldo 0 no afecta al grupo', () => {
    const equipo = makeCuenta({
      id: 'equipo',
      nivel: 3,
      esDetalle: true,
      esContraria: false,
      naturaleza: NaturalezaCuenta.DEUDORA,
      claseCuenta: ClaseCuenta.ACTIVO,
      subClaseCuenta: SubClaseCuenta.ACTIVO_NO_CORRIENTE,
      codigoInterno: '1.2.1.001',
    });
    const dep = makeCuenta({
      id: 'dep',
      nivel: 3,
      esDetalle: true,
      esContraria: true,
      naturaleza: NaturalezaCuenta.ACREEDORA,
      claseCuenta: ClaseCuenta.ACTIVO,
      subClaseCuenta: SubClaseCuenta.ACTIVO_NO_CORRIENTE,
      codigoInterno: '1.2.1.002',
    });

    const saldos = [
      makeSaldo('equipo', '5000.00', '0.00'),
      makeSaldo('dep', '0.00', '0.00'), // saldo 0
    ];

    const result = construirBalance({
      estructura: [equipo, dep],
      saldosHasta: saldos,
      saldosGestion: [],
    });

    expect(result.activo.totalBob.toBob()).toBe('5000.00');
  });

  it('grupo sin cuentas contrarias: todos los saldos se suman normalmente', () => {
    const h1 = makeCuenta({
      id: 'h1',
      nivel: 2,
      esDetalle: true,
      esContraria: false,
      naturaleza: NaturalezaCuenta.DEUDORA,
      claseCuenta: ClaseCuenta.ACTIVO,
      subClaseCuenta: SubClaseCuenta.ACTIVO_CORRIENTE,
      codigoInterno: '1.1.001',
    });
    const h2 = makeCuenta({
      id: 'h2',
      nivel: 2,
      esDetalle: true,
      esContraria: false,
      naturaleza: NaturalezaCuenta.DEUDORA,
      claseCuenta: ClaseCuenta.ACTIVO,
      subClaseCuenta: SubClaseCuenta.ACTIVO_CORRIENTE,
      codigoInterno: '1.1.002',
    });

    const saldos = [makeSaldo('h1', '2000.00', '0.00'), makeSaldo('h2', '3000.00', '0.00')];

    const result = construirBalance({
      estructura: [h1, h2],
      saldosHasta: saldos,
      saldosGestion: [],
    });

    expect(result.activo.totalBob.toBob()).toBe('5000.00');
  });
});

// ============================================================
// Omisión de saldo 0 (REQ-BG-08)
// ============================================================

describe('construirBalance — omisión de saldo 0', () => {
  it('hoja con saldo 0 es omitida del reporte', () => {
    const h1 = makeCuenta({
      id: 'h1',
      esDetalle: true,
      codigoInterno: '1.1.001',
      subClaseCuenta: SubClaseCuenta.ACTIVO_CORRIENTE,
    });
    const h2 = makeCuenta({
      id: 'h2',
      esDetalle: true,
      codigoInterno: '1.1.002',
      subClaseCuenta: SubClaseCuenta.ACTIVO_CORRIENTE,
    });

    const saldos = [
      makeSaldo('h1', '1000.00', '0.00'),
      makeSaldo('h2', '500.00', '500.00'), // saldo 0
    ];

    const result = construirBalance({
      estructura: [h1, h2],
      saldosHasta: saldos,
      saldosGestion: [],
    });

    const cuentas = result.activo.subsecciones.flatMap((s) => s.cuentas);
    expect(cuentas.some((c) => c.cuentaId === 'h2')).toBe(false);
    expect(cuentas.some((c) => c.cuentaId === 'h1')).toBe(true);
  });

  it('agrupador con todos los hijos en saldo 0 es omitido', () => {
    const agrup = makeCuenta({
      id: 'agrup',
      nivel: 1,
      esDetalle: false,
      codigoInterno: '1',
      subClaseCuenta: SubClaseCuenta.ACTIVO_CORRIENTE,
    });
    const hoja = makeCuenta({
      id: 'hoja',
      parentId: 'agrup',
      nivel: 2,
      esDetalle: true,
      codigoInterno: '1.001',
      subClaseCuenta: SubClaseCuenta.ACTIVO_CORRIENTE,
    });

    const saldos = [makeSaldo('hoja', '500.00', '500.00')]; // saldo 0

    const result = construirBalance({
      estructura: [agrup, hoja],
      saldosHasta: saldos,
      saldosGestion: [],
    });

    expect(result.activo.subsecciones).toHaveLength(0);
  });

  it('agrupador con ≥1 hijo con saldo ≠ 0 permanece en el reporte', () => {
    const agrup = makeCuenta({
      id: 'agrup',
      nivel: 1,
      esDetalle: false,
      codigoInterno: '1',
      subClaseCuenta: SubClaseCuenta.ACTIVO_CORRIENTE,
    });
    const hojaConSaldo = makeCuenta({
      id: 'h1',
      parentId: 'agrup',
      nivel: 2,
      esDetalle: true,
      codigoInterno: '1.001',
      subClaseCuenta: SubClaseCuenta.ACTIVO_CORRIENTE,
    });
    const horaSinSaldo = makeCuenta({
      id: 'h2',
      parentId: 'agrup',
      nivel: 2,
      esDetalle: true,
      codigoInterno: '1.002',
      subClaseCuenta: SubClaseCuenta.ACTIVO_CORRIENTE,
    });

    const saldos = [
      makeSaldo('h1', '1000.00', '0.00'),
      makeSaldo('h2', '500.00', '500.00'), // saldo 0
    ];

    const result = construirBalance({
      estructura: [agrup, hojaConSaldo, horaSinSaldo],
      saldosHasta: saldos,
      saldosGestion: [],
    });

    expect(result.activo.subsecciones).toHaveLength(1);
    const cuentas = result.activo.subsecciones[0]!.cuentas;
    expect(cuentas.some((c) => c.cuentaId === 'h1')).toBe(true);
    expect(cuentas.some((c) => c.cuentaId === 'h2')).toBe(false);
  });
});

// ============================================================
// Resultado del Ejercicio (REQ-BG-09)
// ============================================================

describe('construirBalance — Resultado del Ejercicio', () => {
  it('Σ INGRESO − Σ EGRESO = resultado del ejercicio correcto', () => {
    const ingreso = makeCuenta({
      id: 'ing1',
      esDetalle: true,
      naturaleza: NaturalezaCuenta.ACREEDORA,
      claseCuenta: ClaseCuenta.INGRESO,
      subClaseCuenta: SubClaseCuenta.INGRESO_OPERATIVO,
      codigoInterno: '4.1.001',
      nombre: 'Ventas',
    });
    const egreso = makeCuenta({
      id: 'egr1',
      esDetalle: true,
      naturaleza: NaturalezaCuenta.DEUDORA,
      claseCuenta: ClaseCuenta.EGRESO,
      subClaseCuenta: SubClaseCuenta.EGRESO_OPERATIVO,
      codigoInterno: '5.1.001',
      nombre: 'Costo de Ventas',
    });

    // saldosHasta (para balance) — vacíos para simplificar
    // saldosGestion (para resultado ejercicio): ingreso 10000, egreso 6000
    const saldosGestion = [
      makeSaldo('ing1', '0.00', '10000.00'), // ACREEDORA: saldo = haber - debe = 10000
      makeSaldo('egr1', '6000.00', '0.00'), // DEUDORA: saldo = debe - haber = 6000
    ];

    const result = construirBalance({
      estructura: [ingreso, egreso],
      saldosHasta: [],
      saldosGestion,
    });

    // Resultado = 10000 − 6000 = 4000
    expect(result.resultadoEjercicioBob.toBob()).toBe('4000.00');
  });

  it('pérdida: resultado negativo como string negativo', () => {
    const ingreso = makeCuenta({
      id: 'ing1',
      esDetalle: true,
      naturaleza: NaturalezaCuenta.ACREEDORA,
      claseCuenta: ClaseCuenta.INGRESO,
      subClaseCuenta: SubClaseCuenta.INGRESO_OPERATIVO,
      codigoInterno: '4.1.001',
    });
    const egreso = makeCuenta({
      id: 'egr1',
      esDetalle: true,
      naturaleza: NaturalezaCuenta.DEUDORA,
      claseCuenta: ClaseCuenta.EGRESO,
      subClaseCuenta: SubClaseCuenta.EGRESO_OPERATIVO,
      codigoInterno: '5.1.001',
    });

    const saldosGestion = [
      makeSaldo('ing1', '0.00', '5000.00'),
      makeSaldo('egr1', '15000.00', '0.00'),
    ];

    const result = construirBalance({
      estructura: [ingreso, egreso],
      saldosHasta: [],
      saldosGestion,
    });

    // Resultado = 5000 − 15000 = -10000
    expect(result.resultadoEjercicioBob.toBob()).toBe('-10000.00');
  });

  it('línea sintética en PATRIMONIO_RESULTADOS: cuentaId null, esSintetica true', () => {
    const ingreso = makeCuenta({
      id: 'ing1',
      esDetalle: true,
      naturaleza: NaturalezaCuenta.ACREEDORA,
      claseCuenta: ClaseCuenta.INGRESO,
      subClaseCuenta: SubClaseCuenta.INGRESO_OPERATIVO,
      codigoInterno: '4.1.001',
    });
    const saldosGestion = [makeSaldo('ing1', '0.00', '3000.00')];

    const result = construirBalance({ estructura: [ingreso], saldosHasta: [], saldosGestion });

    const patrimonioResultados = result.patrimonio.subsecciones.find(
      (s) => s.subClaseCuenta === SubClaseCuenta.PATRIMONIO_RESULTADOS,
    );
    expect(patrimonioResultados).toBeDefined();
    const lineaSintetica = patrimonioResultados!.cuentas.find((c) => c.esSintetica);
    expect(lineaSintetica).toBeDefined();
    expect(lineaSintetica!.cuentaId).toBeNull();
    expect(lineaSintetica!.esSintetica).toBe(true);
    expect(lineaSintetica!.saldoBob.toBob()).toBe('3000.00');
  });

  it('cuentas INGRESO/EGRESO NO aparecen en el árbol del Balance', () => {
    const ingreso = makeCuenta({
      id: 'ing1',
      esDetalle: true,
      naturaleza: NaturalezaCuenta.ACREEDORA,
      claseCuenta: ClaseCuenta.INGRESO,
      subClaseCuenta: SubClaseCuenta.INGRESO_OPERATIVO,
      codigoInterno: '4.1.001',
    });
    const egreso = makeCuenta({
      id: 'egr1',
      esDetalle: true,
      naturaleza: NaturalezaCuenta.DEUDORA,
      claseCuenta: ClaseCuenta.EGRESO,
      subClaseCuenta: SubClaseCuenta.EGRESO_OPERATIVO,
      codigoInterno: '5.1.001',
    });
    const saldosGestion = [
      makeSaldo('ing1', '0.00', '5000.00'),
      makeSaldo('egr1', '3000.00', '0.00'),
    ];

    const result = construirBalance({
      estructura: [ingreso, egreso],
      saldosHasta: [],
      saldosGestion,
    });

    // No debe haber secciones de INGRESO ni EGRESO
    const todasLasSecciones = [result.activo, result.pasivo, result.patrimonio];
    const tieneIngresoOEgreso = todasLasSecciones.some(
      (s) => s.claseCuenta === ClaseCuenta.INGRESO || s.claseCuenta === ClaseCuenta.EGRESO,
    );
    expect(tieneIngresoOEgreso).toBe(false);
  });
});

// ============================================================
// Cuadre de ecuación contable (REQ-BG-11)
// ============================================================

describe('construirBalance — cuadre de ecuación contable', () => {
  it('Activo = Pasivo + Patrimonio: cuadra=true, diferencia="0.00"', () => {
    // Activo: 10000. Pasivo: 6000. Patrimonio: 4000 (capital). Balance cuadra.
    const activo = makeCuenta({
      id: 'act',
      esDetalle: true,
      naturaleza: NaturalezaCuenta.DEUDORA,
      claseCuenta: ClaseCuenta.ACTIVO,
      subClaseCuenta: SubClaseCuenta.ACTIVO_CORRIENTE,
      codigoInterno: '1.1.001',
    });
    const pasivo = makeCuenta({
      id: 'pas',
      esDetalle: true,
      naturaleza: NaturalezaCuenta.ACREEDORA,
      claseCuenta: ClaseCuenta.PASIVO,
      subClaseCuenta: SubClaseCuenta.PASIVO_CORRIENTE,
      codigoInterno: '2.1.001',
    });
    const patrimonio = makeCuenta({
      id: 'pat',
      esDetalle: true,
      naturaleza: NaturalezaCuenta.ACREEDORA,
      claseCuenta: ClaseCuenta.PATRIMONIO,
      subClaseCuenta: SubClaseCuenta.PATRIMONIO_CAPITAL,
      codigoInterno: '3.1.001',
    });

    const saldosHasta = [
      makeSaldo('act', '10000.00', '0.00'),
      makeSaldo('pas', '0.00', '6000.00'),
      makeSaldo('pat', '0.00', '4000.00'),
    ];

    const result = construirBalance({
      estructura: [activo, pasivo, patrimonio],
      saldosHasta,
      saldosGestion: [],
    });

    expect(result.cuadra).toBe(true);
    expect(result.diferenciaBob.toBob()).toBe('0.00');
  });

  it('descuadre de Bs 1.50: cuadra=false, diferencia="1.50" (respuesta 200, no error)', () => {
    const activo = makeCuenta({
      id: 'act',
      esDetalle: true,
      naturaleza: NaturalezaCuenta.DEUDORA,
      claseCuenta: ClaseCuenta.ACTIVO,
      subClaseCuenta: SubClaseCuenta.ACTIVO_CORRIENTE,
      codigoInterno: '1.1.001',
    });

    const saldosHasta = [makeSaldo('act', '1.50', '0.00')]; // Activo = 1.50, Pasivo = 0, Patrimonio = 0

    const result = construirBalance({ estructura: [activo], saldosHasta, saldosGestion: [] });

    expect(result.cuadra).toBe(false);
    // diferencia = |1.50 - (0 + 0)| = 1.50
    expect(result.diferenciaBob.abs().toBob()).toBe('1.50');
  });

  it('diferencia dentro de tolerancia ±0.01: cuadra=true', () => {
    const activo = makeCuenta({
      id: 'act',
      esDetalle: true,
      naturaleza: NaturalezaCuenta.DEUDORA,
      claseCuenta: ClaseCuenta.ACTIVO,
      subClaseCuenta: SubClaseCuenta.ACTIVO_CORRIENTE,
      codigoInterno: '1.1.001',
    });
    const pasivo = makeCuenta({
      id: 'pas',
      esDetalle: true,
      naturaleza: NaturalezaCuenta.ACREEDORA,
      claseCuenta: ClaseCuenta.PASIVO,
      subClaseCuenta: SubClaseCuenta.PASIVO_CORRIENTE,
      codigoInterno: '2.1.001',
    });

    // Activo = 100.01, Pasivo = 100.00 → diferencia = 0.01 ≤ tolerancia
    const saldosHasta = [makeSaldo('act', '100.01', '0.00'), makeSaldo('pas', '0.00', '100.00')];

    const result = construirBalance({
      estructura: [activo, pasivo],
      saldosHasta,
      saldosGestion: [],
    });

    expect(result.cuadra).toBe(true);
  });
});
