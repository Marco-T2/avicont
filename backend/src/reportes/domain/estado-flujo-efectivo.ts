/**
 * Construcción del Estado de Flujo de Efectivo (EFE) por método indirecto.
 *
 * Función pura exportada — cero @Injectable(), cero imports de NestJS/Prisma.
 * Testeable en aislamiento total. Cobertura objetivo ≥ 95% (§7.5 CLAUDE.md).
 *
 * NIC 7 (Resolución CTNAC 01/2012, supletoria de la NC N°11): método indirecto.
 * El flujo de operación parte del RESULTADO DEL EJERCICIO y lo concilia hasta la
 * variación neta de efectivo, clasificando los movimientos en las 3 actividades
 * de la NIC 7: operación, inversión, financiación.
 *
 * Algoritmo (design §3):
 *   1. Indexar saldos inicial / final / rango por cuentaId.
 *   2. Identificar las cuentas de EFECTIVO (ancla de la conciliación):
 *      explícito `actividadFlujo='EFECTIVO'` gana; si ninguna, fallback por el
 *      prefijo de efectivo del plan de cuentas (CODIGO_EFECTIVO_PREFIJO).
 *   3. Resultado del ejercicio = calcularResultadoEjercicioBob (misma fuente de
 *      verdad que Balance General y EEPN — anti-drift). Punto de partida de OPERACIÓN.
 *   4. Por cada cuenta de detalle NO-efectivo y NO-resultado, calcular su
 *      `flujoCaja` (§3.1) y colocarlo en la sección que resuelve `resolverActividadFlujo`.
 *      Las contrarias de inversión (depreciación acumulada) se redirigen a
 *      operación como PARTIDA_NO_MONETARIA.
 *   5. Variación neta = subtotal operación + inversión + financiación.
 *   6. Cuadre: efectivoInicial + variacionNeta ≈ efectivoFinal (±Bs 0.01).
 */

import {
  ActividadFlujo,
  ClaseCuenta,
  NaturalezaCuenta,
  SubClaseCuenta,
} from '@/common/domain/enums';

import { Money } from '@/common/domain/money';

import type {
  CuentaEfectivoHeuristicaCalculada,
  EstadoFlujoEfectivoResult,
  LineaFlujoCalculada,
} from '../dto/estado-flujo-efectivo-response.dto';
import type { CuentaEstructuraRow, SaldoCuentaRow } from '../ports/eeff-saldos-reader.port';
import { calcularResultadoEjercicioBob } from './resultado-ejercicio';
import { calcularSaldoNeto } from './saldo-naturaleza';

/**
 * Prefijo de efectivo y equivalentes del plan de cuentas — convención del seed
 * comercial (`1.1.1` = "EFECTIVO Y EQUIVALENTES DE EFECTIVO", hojas CAJA/BANCOS).
 * Heurística confiable como fallback, no garantía: el admin puede recodificar.
 */
export const CODIGO_EFECTIVO_PREFIJO = '1.1.1';

const NOMBRE_RESULTADO_EJERCICIO = 'Resultado del ejercicio';

export interface ConstruirEstadoFlujoEfectivoParams {
  estructura: CuentaEstructuraRow[];
  /** Saldos acumulados hasta el día anterior al inicio del período (saldo inicial). */
  saldosInicial: SaldoCuentaRow[];
  /** Saldos acumulados hasta el fin del período (saldo final). */
  saldosFinal: SaldoCuentaRow[];
  /** Saldos de FLUJO del período [desde, hasta] (resultado + partidas del período). */
  saldosRango: SaldoCuentaRow[];
}

/**
 * Resuelve la actividad del EFE de una cuenta (NIC 7).
 * Enfoque C (REQ-FE-04): campo explícito gana; si null, default heurístico.
 */
export function resolverActividadFlujo(cuenta: CuentaEstructuraRow): ActividadFlujo {
  if (cuenta.actividadFlujo !== null) {
    return cuenta.actividadFlujo;
  }

  // NIC 7: efectivo y equivalentes — ancla de la conciliación, no una sección.
  if (esEfectivoPorCodigo(cuenta)) {
    return ActividadFlujo.EFECTIVO;
  }

  const sub = cuenta.subClaseCuenta;
  // NIC 7: activos no corrientes = actividades de inversión.
  if (sub === SubClaseCuenta.ACTIVO_NO_CORRIENTE) {
    return ActividadFlujo.INVERSION;
  }
  // NIC 7: pasivos no corrientes y patrimonio = actividades de financiación.
  if (sub === SubClaseCuenta.PASIVO_NO_CORRIENTE || cuenta.claseCuenta === ClaseCuenta.PATRIMONIO) {
    return ActividadFlujo.FINANCIACION;
  }
  // NIC 7: resto (corrientes no-efectivo, ingresos, egresos) = operación.
  return ActividadFlujo.OPERACION;
}

function esEfectivoPorCodigo(cuenta: CuentaEstructuraRow): boolean {
  return cuenta.esDetalle && cuenta.codigoInterno.startsWith(CODIGO_EFECTIVO_PREFIJO);
}

export function construirEstadoFlujoEfectivo(
  params: ConstruirEstadoFlujoEfectivoParams,
): EstadoFlujoEfectivoResult {
  const { estructura, saldosInicial, saldosFinal, saldosRango } = params;

  const inicialPorCuenta = indexar(saldosInicial);
  const finalPorCuenta = indexar(saldosFinal);

  const cuentasDetalle = estructura.filter((c) => c.esDetalle);

  // ── 1. Identificar las cuentas de EFECTIVO (ancla, §2 design) ────────────
  const hayEfectivoExplicito = cuentasDetalle.some(
    (c) => c.actividadFlujo === ActividadFlujo.EFECTIVO,
  );
  const cuentasEfectivo = cuentasDetalle.filter((c) =>
    hayEfectivoExplicito ? c.actividadFlujo === ActividadFlujo.EFECTIVO : esEfectivoPorCodigo(c),
  );
  const idsEfectivo = new Set(cuentasEfectivo.map((c) => c.id));

  let efectivoInicial = Money.ZERO;
  let efectivoFinal = Money.ZERO;
  for (const cuenta of cuentasEfectivo) {
    efectivoInicial = efectivoInicial.plus(netoDe(inicialPorCuenta.get(cuenta.id), cuenta));
    efectivoFinal = efectivoFinal.plus(netoDe(finalPorCuenta.get(cuenta.id), cuenta));
  }

  // ── 2. Resultado del ejercicio: punto de partida de OPERACIÓN ────────────
  // NIC 7: método indirecto — el flujo de operación parte del resultado del ejercicio.
  const resultadoEjercicio = calcularResultadoEjercicioBob(estructura, saldosRango);

  // El renglón sintético del resultado solo se emite si aporta algo: un EFE de
  // un período sin ingresos ni egresos no debe mostrar un "Resultado 0.00".
  const lineasOperacion: LineaFlujoCalculada[] = resultadoEjercicio.isZero()
    ? []
    : [
        {
          cuentaId: null,
          codigoInterno: null,
          nombre: NOMBRE_RESULTADO_EJERCICIO,
          tipo: 'RESULTADO_EJERCICIO',
          montoBob: resultadoEjercicio,
        },
      ];
  const lineasInversion: LineaFlujoCalculada[] = [];
  const lineasFinanciacion: LineaFlujoCalculada[] = [];

  // ── 3. Distribuir las cuentas no-efectivo / no-resultado en secciones ────
  for (const cuenta of cuentasDetalle) {
    if (idsEfectivo.has(cuenta.id)) continue;
    // Las cuentas de resultado ya están sintetizadas en el resultado del
    // ejercicio (no se doble-cuentan, REQ-FE-06).
    if (cuenta.claseCuenta === ClaseCuenta.INGRESO || cuenta.claseCuenta === ClaseCuenta.EGRESO) {
      continue;
    }

    // NIC 7 (método indirecto): el resultado del ejercicio YA es el punto de
    // partida de operación (calcularResultadoEjercicioBob sobre ingresos/egresos).
    // El movimiento de la cuenta patrimonial de resultados es la contrapartida
    // del asiento de cierre/devengo que traslada ese resultado al patrimonio →
    // contarlo como variación de financiación lo doble-contaría (REQ-FE-08).
    // LIMITACIÓN: si esta cuenta también capturara distribución de dividendos o
    // retiros, eso SÍ sería financiación real; el día-uno se refina con el campo
    // explícito `actividadFlujo` (enfoque C). Acá solo se excluye el traslado.
    if (cuenta.subClaseCuenta === SubClaseCuenta.PATRIMONIO_RESULTADOS) {
      continue;
    }

    const flujo = flujoCaja(cuenta, inicialPorCuenta, finalPorCuenta);
    if (flujo.isZero()) continue;

    const actividad = resolverActividadFlujo(cuenta);

    // NIC 7: las partidas no monetarias (depreciación/amortización acumulada,
    // cuentas contrarias de inversión) no implicaron salida de efectivo → se
    // suman de vuelta al resultado, en operación.
    if (actividad === ActividadFlujo.INVERSION && cuenta.esContraria) {
      lineasOperacion.push(linea(cuenta, 'PARTIDA_NO_MONETARIA', flujo));
      continue;
    }

    if (actividad === ActividadFlujo.OPERACION) {
      lineasOperacion.push(linea(cuenta, 'VARIACION_CAPITAL_TRABAJO', flujo));
    } else if (actividad === ActividadFlujo.INVERSION) {
      lineasInversion.push(linea(cuenta, 'VARIACION_CUENTA', flujo));
    } else if (actividad === ActividadFlujo.FINANCIACION) {
      lineasFinanciacion.push(linea(cuenta, 'VARIACION_CUENTA', flujo));
    }
    // EFECTIVO no llega acá (excluido arriba).
  }

  // ── 4. Subtotales por sección ────────────────────────────────────────────
  const subtotalOperacion = sumar(lineasOperacion);
  const subtotalInversion = sumar(lineasInversion);
  const subtotalFinanciacion = sumar(lineasFinanciacion);

  // ── 5. Variación neta y cuadre ─────────────────────────────────────────
  const variacionNeta = subtotalOperacion.plus(subtotalInversion).plus(subtotalFinanciacion);
  const reconstruido = efectivoInicial.plus(variacionNeta);
  const cuadra = reconstruido.balanceadoEnBobCon(efectivoFinal);
  const diferencia = reconstruido.minus(efectivoFinal);

  // ── 6. Señales de calidad (espejo de cuentasNaturalezaOpuesta) ───────────
  const advertencias: string[] = [];
  const cuentasEfectivoDetectadasPorHeuristica: CuentaEfectivoHeuristicaCalculada[] = [];

  if (cuentasEfectivo.length === 0) {
    advertencias.push(
      'No se identificó ninguna cuenta de efectivo (ni marcada como EFECTIVO ni por código).',
    );
  } else if (!hayEfectivoExplicito) {
    advertencias.push(
      'Las cuentas de efectivo se identificaron por heurística de código (ninguna marcada explícitamente como EFECTIVO).',
    );
    for (const cuenta of cuentasEfectivo) {
      cuentasEfectivoDetectadasPorHeuristica.push({
        cuentaId: cuenta.id,
        codigoInterno: cuenta.codigoInterno,
        nombre: cuenta.nombre,
      });
    }
  }

  return {
    resultadoEjercicioBob: resultadoEjercicio,
    operacion: { lineas: lineasOperacion, subtotalBob: subtotalOperacion },
    inversion: { lineas: lineasInversion, subtotalBob: subtotalInversion },
    financiacion: { lineas: lineasFinanciacion, subtotalBob: subtotalFinanciacion },
    efectivoInicialBob: efectivoInicial,
    variacionNetaBob: variacionNeta,
    efectivoFinalBob: efectivoFinal,
    cuadra,
    diferenciaBob: diferencia,
    advertencias,
    cuentasEfectivoDetectadasPorHeuristica,
  };
}

/**
 * Flujo de caja de una cuenta NO-efectivo y NO-resultado (§3.1 design).
 *
 * Δsaldo = saldoNeto(final) − saldoNeto(inicial), ya respeta la naturaleza.
 * NIC 7: aumento de activo consume efectivo (flujo −Δ); aumento de pasivo o
 * patrimonio libera efectivo (flujo +Δ).
 */
function flujoCaja(
  cuenta: CuentaEstructuraRow,
  inicial: Map<string, SaldoCuentaRow>,
  final: Map<string, SaldoCuentaRow>,
): Money {
  const saldoInicial = netoDe(inicial.get(cuenta.id), cuenta);
  const saldoFinal = netoDe(final.get(cuenta.id), cuenta);
  const delta = saldoFinal.minus(saldoInicial);

  // Activo (DEUDORA): aumento consume efectivo → flujo = −Δ.
  // Pasivo/Patrimonio (ACREEDORA): aumento libera efectivo → flujo = +Δ.
  return cuenta.naturaleza === NaturalezaCuenta.DEUDORA ? Money.ZERO.minus(delta) : delta;
}

function linea(
  cuenta: CuentaEstructuraRow,
  tipo: LineaFlujoCalculada['tipo'],
  montoBob: Money,
): LineaFlujoCalculada {
  return {
    cuentaId: cuenta.id,
    codigoInterno: cuenta.codigoInterno,
    nombre: cuenta.nombre,
    tipo,
    montoBob,
  };
}

function sumar(lineas: LineaFlujoCalculada[]): Money {
  return lineas.reduce((acc, l) => acc.plus(l.montoBob), Money.ZERO);
}

function indexar(saldos: SaldoCuentaRow[]): Map<string, SaldoCuentaRow> {
  return new Map(saldos.map((s) => [s.cuentaId, s]));
}

function netoDe(saldo: SaldoCuentaRow | undefined, cuenta: CuentaEstructuraRow): Money {
  if (!saldo) return Money.ZERO;
  return calcularSaldoNeto(saldo.totalDebitoBob, saldo.totalCreditoBob, cuenta.naturaleza);
}
