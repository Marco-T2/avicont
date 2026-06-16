/**
 * Construcción del Estado de Evolución del Patrimonio Neto (EEPN) — nivel A+.
 *
 * Función pura exportada — cero @Injectable(), cero imports de NestJS/Prisma.
 * Testeable en aislamiento total. Cobertura objetivo ≥ 95% (§7.5 CLAUDE.md).
 *
 * Algoritmo:
 *   1. Por cada cuenta HOJA de PATRIMONIO con contenido: calcular su saldo neto
 *      inicial (saldosInicial), final (saldosFinal) y el movimiento del período
 *      (saldosRango). El "Resultado del Ejercicio" de estos componentes es 0:
 *      pre-cierre el resultado vive en INGRESO/EGRESO, no en el Mayor del patrimonio.
 *   2. Agregar la columna SINTÉTICA "Resultado del Ejercicio (en curso)" computada
 *      como Σingresos − Σegresos del rango (mismo cálculo que el Balance General,
 *      vía `calcularResultadoEjercicioBob` — anti-drift). Solo si ≠ 0.
 *   3. Totalizar las 4 columnas aplicando esContraria (las contrarias restan,
 *      espejo de la propagación del Balance).
 *   4. Cuadre por componente: saldoInicial + resultado + otrosMovimientos ≈ saldoFinal.
 *      Es una identidad aritmética que valida la matemática de fechas (el saldo
 *      inicial corta en desde−1 y el rango en [desde, hasta], sin hueco ni solape).
 *
 * Control cruzado clave: el total de saldoFinal del EEPN debe coincidir con el
 * Total Patrimonio del Balance General a fecha = hasta (incluido el Resultado del
 * Ejercicio en curso).
 */

import { ClaseCuenta } from '@/common/domain/enums';

import { Money } from '@/common/domain/money';

import type {
  ComponentePatrimonioCalculado,
  EvolucionPatrimonioResult,
} from '../dto/evolucion-patrimonio-response.dto';
import type { CuentaEstructuraRow, SaldoCuentaRow } from '../ports/eeff-saldos-reader.port';
import { calcularResultadoEjercicioBob } from './resultado-ejercicio';
import { calcularSaldoNeto } from './saldo-naturaleza';

export interface ConstruirEvolucionPatrimonioParams {
  estructura: CuentaEstructuraRow[];
  /** Saldos acumulados hasta el día anterior al inicio del período (saldo inicial). */
  saldosInicial: SaldoCuentaRow[];
  /** Saldos acumulados hasta el fin del período (saldo final). */
  saldosFinal: SaldoCuentaRow[];
  /** Saldos de FLUJO del período [desde, hasta] (movimiento + resultado). */
  saldosRango: SaldoCuentaRow[];
}

const NOMBRE_RESULTADO_SINTETICO = 'Resultado del Ejercicio (en curso)';

export function construirEvolucionPatrimonio(
  params: ConstruirEvolucionPatrimonioParams,
): EvolucionPatrimonioResult {
  const { estructura, saldosInicial, saldosFinal, saldosRango } = params;

  const inicialPorCuenta = indexar(saldosInicial);
  const finalPorCuenta = indexar(saldosFinal);
  const rangoPorCuenta = indexar(saldosRango);

  const componentes: ComponentePatrimonioCalculado[] = [];

  // ── 1. Componentes reales: cuentas hoja de PATRIMONIO con contenido ──────
  for (const cuenta of estructura) {
    if (!cuenta.esDetalle) continue;
    if (cuenta.claseCuenta !== ClaseCuenta.PATRIMONIO) continue;

    const saldoInicial = netoDe(inicialPorCuenta.get(cuenta.id), cuenta);
    const saldoFinal = netoDe(finalPorCuenta.get(cuenta.id), cuenta);
    const otrosMovimientos = netoDe(rangoPorCuenta.get(cuenta.id), cuenta);

    const tieneContenido =
      !saldoInicial.isZero() || !saldoFinal.isZero() || !otrosMovimientos.isZero();
    if (!tieneContenido) continue;

    // Cuadre por componente: el Resultado del Ejercicio imputado a una cuenta del
    // Mayor es 0 (vive en INGRESO/EGRESO, no acá), así que la identidad es
    // saldoInicial + otrosMovimientos ≈ saldoFinal.
    const sumaCalculada = saldoInicial.plus(otrosMovimientos);
    const diferencia = sumaCalculada.minus(saldoFinal);

    componentes.push({
      cuentaId: cuenta.id,
      codigoInterno: cuenta.codigoInterno,
      nombre: cuenta.nombre,
      esContraria: cuenta.esContraria,
      esSintetica: false,
      saldoInicialBob: saldoInicial,
      resultadoEjercicioBob: Money.ZERO,
      otrosMovimientosBob: otrosMovimientos,
      saldoFinalBob: saldoFinal,
      cuadra: sumaCalculada.balanceadoEnBobCon(saldoFinal),
      diferenciaBob: diferencia,
    });
  }

  // ── 2. Columna sintética del Resultado del Ejercicio ─────────────────────
  const resultadoEjercicio = calcularResultadoEjercicioBob(estructura, saldosRango);
  if (!resultadoEjercicio.isZero()) {
    componentes.push({
      cuentaId: null,
      codigoInterno: null,
      nombre: NOMBRE_RESULTADO_SINTETICO,
      esContraria: false,
      esSintetica: true,
      saldoInicialBob: Money.ZERO,
      resultadoEjercicioBob: resultadoEjercicio,
      otrosMovimientosBob: Money.ZERO,
      saldoFinalBob: resultadoEjercicio,
      cuadra: true,
      diferenciaBob: Money.ZERO,
    });
  }

  // ── 3. Totales (aplicando esContraria, espejo del Balance) ───────────────
  let totalInicial = Money.ZERO;
  let totalResultado = Money.ZERO;
  let totalMovimientos = Money.ZERO;
  let totalFinal = Money.ZERO;

  for (const c of componentes) {
    // NCB + Código Tributario art. 47: las cuentas contrarias restan del total del patrimonio.
    if (c.esContraria) {
      totalInicial = totalInicial.minus(c.saldoInicialBob);
      totalResultado = totalResultado.minus(c.resultadoEjercicioBob);
      totalMovimientos = totalMovimientos.minus(c.otrosMovimientosBob);
      totalFinal = totalFinal.minus(c.saldoFinalBob);
    } else {
      totalInicial = totalInicial.plus(c.saldoInicialBob);
      totalResultado = totalResultado.plus(c.resultadoEjercicioBob);
      totalMovimientos = totalMovimientos.plus(c.otrosMovimientosBob);
      totalFinal = totalFinal.plus(c.saldoFinalBob);
    }
  }

  // ── 4. Cuadre global ─────────────────────────────────────────────────────
  const sumaTotalCalculada = totalInicial.plus(totalResultado).plus(totalMovimientos);
  const diferenciaTotal = sumaTotalCalculada.minus(totalFinal);
  const totalCuadra = sumaTotalCalculada.balanceadoEnBobCon(totalFinal);
  const todosLosComponentesCuadran = componentes.every((c) => c.cuadra);

  return {
    componentes,
    totales: {
      saldoInicialBob: totalInicial,
      resultadoEjercicioBob: totalResultado,
      otrosMovimientosBob: totalMovimientos,
      saldoFinalBob: totalFinal,
    },
    cuadra: totalCuadra && todosLosComponentesCuadran,
    diferenciaBob: diferenciaTotal,
  };
}

function indexar(saldos: SaldoCuentaRow[]): Map<string, SaldoCuentaRow> {
  return new Map(saldos.map((s) => [s.cuentaId, s]));
}

function netoDe(saldo: SaldoCuentaRow | undefined, cuenta: CuentaEstructuraRow): Money {
  if (!saldo) return Money.ZERO;
  return calcularSaldoNeto(saldo.totalDebitoBob, saldo.totalCreditoBob, cuenta.naturaleza);
}
