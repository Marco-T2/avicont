import { Decimal } from '@prisma/client/runtime/library';

import {
  ActividadFlujo,
  ClaseCuenta,
  NaturalezaCuenta,
  SubClaseCuenta,
} from '@/common/domain/enums';

import { construirEstadoFlujoEfectivo, resolverActividadFlujo } from './estado-flujo-efectivo';
import type { CuentaEstructuraRow, SaldoCuentaRow } from '../ports/eeff-saldos-reader.port';

// ============================================================
// Fixtures
// ============================================================

function makeCuenta(overrides: Partial<CuentaEstructuraRow> = {}): CuentaEstructuraRow {
  return {
    id: 'c1',
    parentId: null,
    nivel: 4,
    esDetalle: true,
    esContraria: false,
    claseCuenta: ClaseCuenta.ACTIVO,
    subClaseCuenta: SubClaseCuenta.ACTIVO_CORRIENTE,
    naturaleza: NaturalezaCuenta.DEUDORA,
    codigoInterno: '1.1.1.001',
    nombre: 'Caja MN',
    actividadFlujo: null,
    ...overrides,
  };
}

function saldo(cuentaId: string, debe: string, haber: string): SaldoCuentaRow {
  return {
    cuentaId,
    totalDebitoBob: new Decimal(debe),
    totalCreditoBob: new Decimal(haber),
  };
}

// ============================================================
// resolverActividadFlujo (REQ-FE-04)
// ============================================================

describe('resolverActividadFlujo', () => {
  it('el campo explícito gana sobre la heurística', () => {
    const cuenta = makeCuenta({
      subClaseCuenta: SubClaseCuenta.ACTIVO_NO_CORRIENTE,
      actividadFlujo: ActividadFlujo.OPERACION,
    });
    expect(resolverActividadFlujo(cuenta)).toBe(ActividadFlujo.OPERACION);
  });

  it('cuenta de efectivo por prefijo de código → EFECTIVO', () => {
    const cuenta = makeCuenta({ codigoInterno: '1.1.1.001', actividadFlujo: null });
    expect(resolverActividadFlujo(cuenta)).toBe(ActividadFlujo.EFECTIVO);
  });

  it('ACTIVO_NO_CORRIENTE sin flag → INVERSION', () => {
    const cuenta = makeCuenta({
      codigoInterno: '1.2.1.001',
      subClaseCuenta: SubClaseCuenta.ACTIVO_NO_CORRIENTE,
      actividadFlujo: null,
    });
    expect(resolverActividadFlujo(cuenta)).toBe(ActividadFlujo.INVERSION);
  });

  it('PASIVO_NO_CORRIENTE sin flag → FINANCIACION', () => {
    const cuenta = makeCuenta({
      codigoInterno: '2.2.1.001',
      claseCuenta: ClaseCuenta.PASIVO,
      subClaseCuenta: SubClaseCuenta.PASIVO_NO_CORRIENTE,
      naturaleza: NaturalezaCuenta.ACREEDORA,
      actividadFlujo: null,
    });
    expect(resolverActividadFlujo(cuenta)).toBe(ActividadFlujo.FINANCIACION);
  });

  it('PATRIMONIO sin flag → FINANCIACION', () => {
    const cuenta = makeCuenta({
      codigoInterno: '3.1.1.001',
      claseCuenta: ClaseCuenta.PATRIMONIO,
      subClaseCuenta: SubClaseCuenta.PATRIMONIO_CAPITAL,
      naturaleza: NaturalezaCuenta.ACREEDORA,
      actividadFlujo: null,
    });
    expect(resolverActividadFlujo(cuenta)).toBe(ActividadFlujo.FINANCIACION);
  });

  it('activo corriente no-efectivo → OPERACION', () => {
    const cuenta = makeCuenta({
      codigoInterno: '1.1.2.001',
      subClaseCuenta: SubClaseCuenta.ACTIVO_CORRIENTE,
      actividadFlujo: null,
    });
    expect(resolverActividadFlujo(cuenta)).toBe(ActividadFlujo.OPERACION);
  });

  it('ingreso → OPERACION', () => {
    const cuenta = makeCuenta({
      codigoInterno: '4.1.1.001',
      claseCuenta: ClaseCuenta.INGRESO,
      subClaseCuenta: SubClaseCuenta.INGRESO_OPERATIVO,
      naturaleza: NaturalezaCuenta.ACREEDORA,
      actividadFlujo: null,
    });
    expect(resolverActividadFlujo(cuenta)).toBe(ActividadFlujo.OPERACION);
  });
});

// ============================================================
// construirEstadoFlujoEfectivo
// ============================================================

describe('construirEstadoFlujoEfectivo', () => {
  // Plantilla de cuentas habitual
  const caja = makeCuenta({
    id: 'caja',
    codigoInterno: '1.1.1.001',
    nombre: 'Caja MN',
    subClaseCuenta: SubClaseCuenta.ACTIVO_CORRIENTE,
    naturaleza: NaturalezaCuenta.DEUDORA,
  });
  const ventas = makeCuenta({
    id: 'ventas',
    codigoInterno: '4.1.1.001',
    nombre: 'Ventas',
    claseCuenta: ClaseCuenta.INGRESO,
    subClaseCuenta: SubClaseCuenta.INGRESO_OPERATIVO,
    naturaleza: NaturalezaCuenta.ACREEDORA,
  });
  const costos = makeCuenta({
    id: 'costos',
    codigoInterno: '5.1.1.001',
    nombre: 'Costo de ventas',
    claseCuenta: ClaseCuenta.EGRESO,
    subClaseCuenta: SubClaseCuenta.EGRESO_OPERATIVO,
    naturaleza: NaturalezaCuenta.DEUDORA,
  });

  it('el punto de partida de operación es el resultado del ejercicio', () => {
    // Ventas 20000 (haber), Costos 15000 (debe) → resultado 5000
    const result = construirEstadoFlujoEfectivo({
      estructura: [caja, ventas, costos],
      saldosInicial: [],
      saldosFinal: [saldo('caja', '5000', '0')],
      saldosRango: [saldo('ventas', '0', '20000'), saldo('costos', '15000', '0')],
    });

    expect(result.resultadoEjercicioBob.toBob()).toBe('5000.00');
    const lineaResultado = result.operacion.lineas.find((l) => l.tipo === 'RESULTADO_EJERCICIO');
    expect(lineaResultado).toBeDefined();
    expect(lineaResultado!.cuentaId).toBeNull();
    expect(lineaResultado!.montoBob.toBob()).toBe('5000.00');
  });

  it('aumento de cuenta por cobrar (activo de operación) reduce el flujo de operación', () => {
    const cxc = makeCuenta({
      id: 'cxc',
      codigoInterno: '1.1.2.001',
      nombre: 'Cuentas por cobrar',
      subClaseCuenta: SubClaseCuenta.ACTIVO_CORRIENTE,
      naturaleza: NaturalezaCuenta.DEUDORA,
    });
    // CxC sube de 0 a 3000 → consume efectivo → -3000
    const result = construirEstadoFlujoEfectivo({
      estructura: [caja, cxc],
      saldosInicial: [],
      saldosFinal: [saldo('cxc', '3000', '0'), saldo('caja', '0', '3000')],
      saldosRango: [],
    });

    const linea = result.operacion.lineas.find((l) => l.cuentaId === 'cxc');
    expect(linea).toBeDefined();
    expect(linea!.tipo).toBe('VARIACION_CAPITAL_TRABAJO');
    expect(linea!.montoBob.toBob()).toBe('-3000.00');
  });

  it('aumento de cuenta por pagar (pasivo de operación) aumenta el flujo de operación', () => {
    const cxp = makeCuenta({
      id: 'cxp',
      codigoInterno: '2.1.1.001',
      nombre: 'Cuentas por pagar',
      claseCuenta: ClaseCuenta.PASIVO,
      subClaseCuenta: SubClaseCuenta.PASIVO_CORRIENTE,
      naturaleza: NaturalezaCuenta.ACREEDORA,
    });
    // CxP sube de 0 a 2000 → libera efectivo → +2000
    const result = construirEstadoFlujoEfectivo({
      estructura: [caja, cxp],
      saldosInicial: [],
      saldosFinal: [saldo('cxp', '0', '2000'), saldo('caja', '2000', '0')],
      saldosRango: [],
    });

    const linea = result.operacion.lineas.find((l) => l.cuentaId === 'cxp');
    expect(linea).toBeDefined();
    expect(linea!.montoBob.toBob()).toBe('2000.00');
  });

  it('ingresos/egresos NO se doble-cuentan como variación de capital de trabajo', () => {
    const result = construirEstadoFlujoEfectivo({
      estructura: [caja, ventas, costos],
      saldosInicial: [],
      saldosFinal: [saldo('caja', '5000', '0')],
      saldosRango: [saldo('ventas', '0', '20000'), saldo('costos', '15000', '0')],
    });

    expect(result.operacion.lineas.find((l) => l.cuentaId === 'ventas')).toBeUndefined();
    expect(result.operacion.lineas.find((l) => l.cuentaId === 'costos')).toBeUndefined();
  });

  it('compra de activo fijo (inversión) aparece negativa', () => {
    const maquinaria = makeCuenta({
      id: 'maq',
      codigoInterno: '1.2.1.001',
      nombre: 'Maquinaria',
      subClaseCuenta: SubClaseCuenta.ACTIVO_NO_CORRIENTE,
      naturaleza: NaturalezaCuenta.DEUDORA,
    });
    // Maquinaria sube 0 → 10000 → consume efectivo → -10000
    const result = construirEstadoFlujoEfectivo({
      estructura: [caja, maquinaria],
      saldosInicial: [],
      saldosFinal: [saldo('maq', '10000', '0'), saldo('caja', '0', '10000')],
      saldosRango: [],
    });

    const linea = result.inversion.lineas.find((l) => l.cuentaId === 'maq');
    expect(linea).toBeDefined();
    expect(linea!.tipo).toBe('VARIACION_CUENTA');
    expect(linea!.montoBob.toBob()).toBe('-10000.00');
    expect(result.inversion.subtotalBob.toBob()).toBe('-10000.00');
  });

  it('aporte de capital (financiación) aparece positivo', () => {
    const capital = makeCuenta({
      id: 'cap',
      codigoInterno: '3.1.1.001',
      nombre: 'Capital social',
      claseCuenta: ClaseCuenta.PATRIMONIO,
      subClaseCuenta: SubClaseCuenta.PATRIMONIO_CAPITAL,
      naturaleza: NaturalezaCuenta.ACREEDORA,
    });
    // Capital sube 0 → 50000 → libera efectivo → +50000
    const result = construirEstadoFlujoEfectivo({
      estructura: [caja, capital],
      saldosInicial: [],
      saldosFinal: [saldo('cap', '0', '50000'), saldo('caja', '50000', '0')],
      saldosRango: [],
    });

    const linea = result.financiacion.lineas.find((l) => l.cuentaId === 'cap');
    expect(linea).toBeDefined();
    expect(linea!.montoBob.toBob()).toBe('50000.00');
    expect(result.financiacion.subtotalBob.toBob()).toBe('50000.00');
  });

  it('partida no monetaria: depreciación acumulada se suma de vuelta en operación', () => {
    const depreciacion = makeCuenta({
      id: 'dep',
      codigoInterno: '1.2.9.001',
      nombre: 'Depreciación acumulada',
      claseCuenta: ClaseCuenta.ACTIVO,
      subClaseCuenta: SubClaseCuenta.ACTIVO_NO_CORRIENTE,
      naturaleza: NaturalezaCuenta.ACREEDORA, // contraria
      esContraria: true,
    });
    // Depreciación acumulada sube 2000 (haber) → saldoNeto ACREEDORA = +2000
    // No implicó salida de efectivo → +2000 en operación (partida no monetaria)
    const result = construirEstadoFlujoEfectivo({
      estructura: [caja, depreciacion],
      saldosInicial: [],
      saldosFinal: [saldo('dep', '0', '2000')],
      saldosRango: [],
    });

    const linea = result.operacion.lineas.find((l) => l.cuentaId === 'dep');
    expect(linea).toBeDefined();
    expect(linea!.tipo).toBe('PARTIDA_NO_MONETARIA');
    expect(linea!.montoBob.toBob()).toBe('2000.00');
    // No debe aparecer en inversión (ya se redirigió a operación).
    expect(result.inversion.lineas.find((l) => l.cuentaId === 'dep')).toBeUndefined();
  });

  it('variación neta suma las tres secciones', () => {
    const maquinaria = makeCuenta({
      id: 'maq',
      codigoInterno: '1.2.1.001',
      nombre: 'Maquinaria',
      subClaseCuenta: SubClaseCuenta.ACTIVO_NO_CORRIENTE,
      naturaleza: NaturalezaCuenta.DEUDORA,
    });
    const capital = makeCuenta({
      id: 'cap',
      codigoInterno: '3.1.1.001',
      nombre: 'Capital social',
      claseCuenta: ClaseCuenta.PATRIMONIO,
      subClaseCuenta: SubClaseCuenta.PATRIMONIO_CAPITAL,
      naturaleza: NaturalezaCuenta.ACREEDORA,
    });
    // Resultado 5000 (operación), Maquinaria +10000 → -10000 (inversión), Capital +50000 (financiación)
    const result = construirEstadoFlujoEfectivo({
      estructura: [caja, ventas, costos, maquinaria, capital],
      saldosInicial: [],
      saldosFinal: [
        saldo('maq', '10000', '0'),
        saldo('cap', '0', '50000'),
        saldo('caja', '45000', '0'),
      ],
      saldosRango: [saldo('ventas', '0', '20000'), saldo('costos', '15000', '0')],
    });

    expect(result.operacion.subtotalBob.toBob()).toBe('5000.00');
    expect(result.inversion.subtotalBob.toBob()).toBe('-10000.00');
    expect(result.financiacion.subtotalBob.toBob()).toBe('50000.00');
    expect(result.variacionNetaBob.toBob()).toBe('45000.00');
  });

  it('el resultado del ejercicio trasladado a patrimonio NO se doble-cuenta en financiación', () => {
    // Escenario: venta 20000 cobrada en caja + costos 12000 pagados en caja →
    // resultado +8000. Un asiento de cierre traslada el resultado a la cuenta
    // patrimonial "Resultado del ejercicio" (ACREEDORA, haber 8000).
    // El resultado YA es el punto de partida de operación (NIC 7 método indirecto);
    // contar la variación de la cuenta patrimonio-resultados como financiación lo
    // contaría dos veces → variacionNeta=16000 ≠ efectivoFinal 8000 → descuadre.
    const resultadoEjercicio = makeCuenta({
      id: 'res-ej',
      codigoInterno: '3.2.1.001',
      nombre: 'Resultado del ejercicio',
      claseCuenta: ClaseCuenta.PATRIMONIO,
      subClaseCuenta: SubClaseCuenta.PATRIMONIO_RESULTADOS,
      naturaleza: NaturalezaCuenta.ACREEDORA,
    });
    const result = construirEstadoFlujoEfectivo({
      estructura: [caja, ventas, costos, resultadoEjercicio],
      saldosInicial: [],
      // Caja final: debe 20000 (venta) − haber 12000 (costos) → neto 8000.
      // Resultado del ejercicio: haber 8000 (traslado del cierre).
      saldosFinal: [saldo('caja', '20000', '12000'), saldo('res-ej', '0', '8000')],
      saldosRango: [saldo('ventas', '0', '20000'), saldo('costos', '12000', '0')],
    });

    expect(result.resultadoEjercicioBob.toBob()).toBe('8000.00');
    expect(result.operacion.subtotalBob.toBob()).toBe('8000.00');
    // La cuenta patrimonio-resultados NO debe aparecer como línea de financiación.
    expect(result.financiacion.lineas.find((l) => l.cuentaId === 'res-ej')).toBeUndefined();
    expect(result.financiacion.subtotalBob.toBob()).toBe('0.00');
    expect(result.efectivoInicialBob.toBob()).toBe('0.00');
    expect(result.efectivoFinalBob.toBob()).toBe('8000.00');
    expect(result.variacionNetaBob.toBob()).toBe('8000.00');
    expect(result.cuadra).toBe(true);
    expect(result.diferenciaBob.toBob()).toBe('0.00');
  });

  it('cuadre verdadero: efectivoInicial + variacionNeta ≈ efectivoFinal', () => {
    // Caja 0 → 3000; resultado 3000 (operación)
    const result = construirEstadoFlujoEfectivo({
      estructura: [caja, ventas],
      saldosInicial: [],
      saldosFinal: [saldo('caja', '3000', '0')],
      saldosRango: [saldo('ventas', '0', '3000')],
    });

    expect(result.efectivoInicialBob.toBob()).toBe('0.00');
    expect(result.efectivoFinalBob.toBob()).toBe('3000.00');
    expect(result.variacionNetaBob.toBob()).toBe('3000.00');
    expect(result.cuadra).toBe(true);
    expect(result.diferenciaBob.toBob()).toBe('0.00');
  });

  it('descuadre detectado: actividades no reconstruyen la variación de efectivo', () => {
    // Caja sube 5000 pero no hay ninguna actividad que lo explique (resultado 0)
    const result = construirEstadoFlujoEfectivo({
      estructura: [caja],
      saldosInicial: [],
      saldosFinal: [saldo('caja', '5000', '0')],
      saldosRango: [],
    });

    expect(result.efectivoFinalBob.toBob()).toBe('5000.00');
    expect(result.variacionNetaBob.toBob()).toBe('0.00');
    expect(result.cuadra).toBe(false);
    expect(result.diferenciaBob.toBob()).toBe('-5000.00');
  });

  it('identifica efectivo por campo explícito EFECTIVO (gana sobre el prefijo)', () => {
    const banco = makeCuenta({
      id: 'banco',
      codigoInterno: '1.1.2.005',
      nombre: 'Banco X',
      subClaseCuenta: SubClaseCuenta.ACTIVO_CORRIENTE,
      naturaleza: NaturalezaCuenta.DEUDORA,
      actividadFlujo: ActividadFlujo.EFECTIVO,
    });
    const result = construirEstadoFlujoEfectivo({
      estructura: [banco],
      saldosInicial: [saldo('banco', '5000', '0')],
      saldosFinal: [saldo('banco', '8000', '0')],
      saldosRango: [],
    });

    expect(result.efectivoInicialBob.toBob()).toBe('5000.00');
    expect(result.efectivoFinalBob.toBob()).toBe('8000.00');
    // El efectivo no aporta a ninguna sección.
    expect(result.operacion.lineas.find((l) => l.cuentaId === 'banco')).toBeUndefined();
    expect(result.cuentasEfectivoDetectadasPorHeuristica).toHaveLength(0);
  });

  it('fallback heurístico por código y señal de calidad', () => {
    const result = construirEstadoFlujoEfectivo({
      estructura: [caja],
      saldosInicial: [saldo('caja', '1000', '0')],
      saldosFinal: [saldo('caja', '1000', '0')],
      saldosRango: [],
    });

    expect(result.cuentasEfectivoDetectadasPorHeuristica).toHaveLength(1);
    expect(result.cuentasEfectivoDetectadasPorHeuristica[0]!.cuentaId).toBe('caja');
    expect(result.advertencias.some((a) => a.toLowerCase().includes('heur'))).toBe(true);
  });

  it('ninguna cuenta de efectivo → advertencia + efectivo en cero', () => {
    const cxc = makeCuenta({
      id: 'cxc',
      codigoInterno: '1.1.2.001',
      nombre: 'Cuentas por cobrar',
      subClaseCuenta: SubClaseCuenta.ACTIVO_CORRIENTE,
      naturaleza: NaturalezaCuenta.DEUDORA,
    });
    const result = construirEstadoFlujoEfectivo({
      estructura: [cxc],
      saldosInicial: [],
      saldosFinal: [saldo('cxc', '1000', '0')],
      saldosRango: [],
    });

    expect(result.efectivoInicialBob.toBob()).toBe('0.00');
    expect(result.efectivoFinalBob.toBob()).toBe('0.00');
    expect(result.advertencias.some((a) => a.toLowerCase().includes('ninguna'))).toBe(true);
  });

  it('ignora saldos de cuentas que no están en la estructura', () => {
    const result = construirEstadoFlujoEfectivo({
      estructura: [caja],
      saldosInicial: [],
      saldosFinal: [saldo('caja', '1000', '0'), saldo('fantasma', '9999', '0')],
      saldosRango: [saldo('fantasma', '5000', '0')],
    });

    // El fantasma no aparece en ninguna sección ni en el efectivo.
    expect(result.efectivoFinalBob.toBob()).toBe('1000.00');
    expect(result.operacion.lineas.find((l) => l.cuentaId === 'fantasma')).toBeUndefined();
    expect(result.inversion.lineas.find((l) => l.cuentaId === 'fantasma')).toBeUndefined();
  });

  it('EFE vacío cuadrado: sin movimiento todas las secciones vacías y cuadra', () => {
    const result = construirEstadoFlujoEfectivo({
      estructura: [caja],
      saldosInicial: [],
      saldosFinal: [],
      saldosRango: [],
    });

    expect(result.operacion.lineas.filter((l) => l.tipo !== 'RESULTADO_EJERCICIO')).toHaveLength(0);
    expect(result.inversion.lineas).toHaveLength(0);
    expect(result.financiacion.lineas).toHaveLength(0);
    expect(result.variacionNetaBob.toBob()).toBe('0.00');
    expect(result.efectivoInicialBob.toBob()).toBe('0.00');
    expect(result.efectivoFinalBob.toBob()).toBe('0.00');
    expect(result.cuadra).toBe(true);
  });

  it('solo cuentas de detalle: las agrupadoras no aportan', () => {
    const agrupadora = makeCuenta({
      id: 'agrup',
      codigoInterno: '1.1',
      nombre: 'Activo corriente',
      esDetalle: false,
      subClaseCuenta: SubClaseCuenta.ACTIVO_CORRIENTE,
    });
    const result = construirEstadoFlujoEfectivo({
      estructura: [caja, agrupadora],
      saldosInicial: [],
      saldosFinal: [saldo('caja', '1000', '0'), saldo('agrup', '99999', '0')],
      saldosRango: [],
    });

    expect(result.efectivoFinalBob.toBob()).toBe('1000.00');
  });
});
