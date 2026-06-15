/**
 * Construcción del Balance de Comprobación de Sumas y Saldos.
 *
 * Función pura exportada — cero @Injectable(), cero imports de NestJS/Prisma.
 * Testeable en aislamiento total. Cobertura objetivo ≥ 95% (§7.5 CLAUDE.md).
 *
 * A diferencia del Balance General / Estado de Resultados, este reporte es una
 * LISTA PLANA de cuentas de detalle con movimiento (DR-2 del design): no hay
 * propagación a agrupadores ni jerarquía. Para cada cuenta de detalle con
 * movimiento en el rango se calculan 4 columnas:
 *   - sumasDebito  = Σ débitos BOB del rango
 *   - sumasCredito = Σ créditos BOB del rango
 *   - saldoDeudor  = MAX(sumasDebito − sumasCredito, 0)
 *   - saldoAcreedor = MAX(sumasCredito − sumasDebito, 0)
 *
 * // Código Tributario art. 47 / §4.1: el Balance de Comprobación verifica el
 * // cuadre de sumas (Σ débitos = Σ créditos) Y de saldos (Σ deudores = Σ
 * // acreedores), tolerancia ±Bs 0.01 por redondeos de conversión multi-moneda.
 */

import { Money } from '@/common/domain/money';

import { NaturalezaCuenta } from '@/common/domain/enums';

import type {
  BalanceComprobacionResult,
  CuentaNaturalezaOpuestaCalculada,
  LineaBalanceComprobacionCalculada,
} from '../dto/balance-comprobacion-response.dto';
import type { CuentaEstructuraRow, SaldoCuentaRow } from '../ports/eeff-saldos-reader.port';

// ============================================================
// Parámetros de entrada
// ============================================================

export interface ConstruirBalanceComprobacionParams {
  estructura: CuentaEstructuraRow[];
  saldosRango: SaldoCuentaRow[];
}

// ============================================================
// Función principal
// ============================================================

/**
 * Construye el Balance de Comprobación a partir de la estructura de cuentas y
 * los saldos de flujo del rango [desde, hasta] calculados por el adapter.
 *
 * // Código Tributario art. 47 / §4.1: cuadre de sumas y de saldos (±Bs 0.01).
 */
export function construirBalanceComprobacion(
  params: ConstruirBalanceComprobacionParams,
): BalanceComprobacionResult {
  const { estructura, saldosRango } = params;

  // Índice de cuentas de DETALLE por id. Las agrupadoras no son cuentas de
  // movimiento (DR-2): nunca aparecen como fila.
  const detallePorId = new Map<string, CuentaEstructuraRow>();
  for (const cuenta of estructura) {
    if (cuenta.esDetalle) {
      detallePorId.set(cuenta.id, cuenta);
    }
  }

  const lineas: LineaBalanceComprobacionCalculada[] = [];

  for (const fila of saldosRango) {
    // DR-4 / REQ-BC-13: fila de saldo sin cuenta de detalle en la estructura
    // (cuenta desactivada con movimiento histórico, o agrupadora) → ignorar.
    const cuenta = detallePorId.get(fila.cuentaId);
    if (!cuenta) continue;

    const sumasDebito = Money.of(fila.totalDebitoBob);
    const sumasCredito = Money.of(fila.totalCreditoBob);

    // DR-1 / REQ-BC-04: omitir cuentas sin movimiento. Defensivo: normalmente el
    // port no devuelve filas en cero, pero el builder no debe asumirlo.
    if (sumasDebito.isZero() && sumasCredito.isZero()) continue;

    // REQ-BC-03: a lo sumo uno de los dos saldos es > 0. No depende de la
    // naturaleza de la cuenta (mecánica universal del Balance de Comprobación).
    const diffDeudor = sumasDebito.minus(sumasCredito);
    const saldoDeudor = diffDeudor.isPositive() ? diffDeudor : Money.ZERO;
    const diffAcreedor = sumasCredito.minus(sumasDebito);
    const saldoAcreedor = diffAcreedor.isPositive() ? diffAcreedor : Money.ZERO;

    lineas.push({
      cuentaId: cuenta.id,
      codigoInterno: cuenta.codigoInterno,
      nombre: cuenta.nombre,
      naturaleza: cuenta.naturaleza,
      sumasDebito,
      sumasCredito,
      saldoDeudor,
      saldoAcreedor,
    });
  }

  // REQ-BC-05: orden por codigoInterno ASC.
  lineas.sort((a, b) => a.codigoInterno.localeCompare(b.codigoInterno));

  // REQ-BC-06: totales de las 4 columnas.
  let totalSumasDebito = Money.ZERO;
  let totalSumasCredito = Money.ZERO;
  let totalSaldoDeudor = Money.ZERO;
  let totalSaldoAcreedor = Money.ZERO;

  for (const linea of lineas) {
    totalSumasDebito = totalSumasDebito.plus(linea.sumasDebito);
    totalSumasCredito = totalSumasCredito.plus(linea.sumasCredito);
    totalSaldoDeudor = totalSaldoDeudor.plus(linea.saldoDeudor);
    totalSaldoAcreedor = totalSaldoAcreedor.plus(linea.saldoAcreedor);
  }

  // §4.1: cuadre de sumas Y de saldos, tolerancia ±Bs 0.01 (reutiliza
  // balanceadoEnBobCon — NO reimplementar la tolerancia).
  const cuadra =
    totalSumasDebito.balanceadoEnBobCon(totalSumasCredito) &&
    totalSaldoDeudor.balanceadoEnBobCon(totalSaldoAcreedor);

  const diferenciaSumas = totalSumasDebito.minus(totalSumasCredito);
  const diferenciaSaldos = totalSaldoDeudor.minus(totalSaldoAcreedor);

  // REQ-BC-07: cuentas con saldo del lado OPUESTO a su naturaleza. Señal de
  // calidad para el contador; NO afecta los totales.
  const cuentasNaturalezaOpuesta: CuentaNaturalezaOpuestaCalculada[] = [];
  for (const linea of lineas) {
    if (linea.naturaleza === NaturalezaCuenta.DEUDORA && linea.saldoAcreedor.isPositive()) {
      cuentasNaturalezaOpuesta.push(aNaturalezaOpuesta(linea, linea.saldoAcreedor));
    } else if (linea.naturaleza === NaturalezaCuenta.ACREEDORA && linea.saldoDeudor.isPositive()) {
      cuentasNaturalezaOpuesta.push(aNaturalezaOpuesta(linea, linea.saldoDeudor));
    }
  }

  return {
    lineas,
    totalSumasDebito,
    totalSumasCredito,
    totalSaldoDeudor,
    totalSaldoAcreedor,
    cuadra,
    diferenciaSumas,
    diferenciaSaldos,
    cuentasNaturalezaOpuesta,
  };
}

function aNaturalezaOpuesta(
  linea: LineaBalanceComprobacionCalculada,
  saldoOpuesto: Money,
): CuentaNaturalezaOpuestaCalculada {
  return {
    cuentaId: linea.cuentaId,
    codigoInterno: linea.codigoInterno,
    nombre: linea.nombre,
    naturaleza: linea.naturaleza,
    saldoOpuesto,
  };
}
