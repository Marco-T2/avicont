/**
 * Cálculo del Resultado del Ejercicio — fuente de verdad única.
 *
 * Función pura compartida por el Balance General (línea sintética en
 * PATRIMONIO_RESULTADOS) y el Estado de Evolución del Patrimonio Neto (columna
 * sintética "Resultado del Ejercicio en curso"). Centralizar la fórmula garantiza
 * que ambos reportes coincidan a la misma fecha (anti-drift, mismo espíritu que
 * `whereBaseRango` en el adapter).
 *
 * Cero @Injectable(), cero imports de NestJS/Prisma — testeable en aislamiento.
 */

import { ClaseCuenta } from '@/common/domain/enums';

import { Money } from '@/common/domain/money';

import type { CuentaEstructuraRow, SaldoCuentaRow } from '../ports/eeff-saldos-reader.port';
import { calcularSaldoNeto } from './saldo-naturaleza';

/**
 * Resultado del Ejercicio = Σ saldoNeto(INGRESO) − Σ saldoNeto(EGRESO),
 * calculado sobre los saldos de FLUJO de un rango (no histórico acumulado).
 *
 * NCB: INGRESO es naturaleza ACREEDORA (saldo = haber−debe);
 * EGRESO es DEUDORA (saldo = debe−haber). `calcularSaldoNeto` da el signo correcto.
 *
 * Utilidad → positivo; pérdida → negativo.
 *
 * Solo cuentas hoja (`esDetalle=true`): los agrupadores no tienen saldo propio.
 */
export function calcularResultadoEjercicioBob(
  estructura: CuentaEstructuraRow[],
  saldosRango: SaldoCuentaRow[],
): Money {
  const saldosPorCuenta = new Map<string, SaldoCuentaRow>(saldosRango.map((s) => [s.cuentaId, s]));

  let totalIngreso = Money.ZERO;
  let totalEgreso = Money.ZERO;

  for (const cuenta of estructura) {
    if (!cuenta.esDetalle) continue;

    const saldoRow = saldosPorCuenta.get(cuenta.id);
    if (!saldoRow) continue;

    const saldoNeto = calcularSaldoNeto(
      saldoRow.totalDebitoBob,
      saldoRow.totalCreditoBob,
      cuenta.naturaleza,
    );

    if (cuenta.claseCuenta === ClaseCuenta.INGRESO) {
      totalIngreso = totalIngreso.plus(saldoNeto);
    } else if (cuenta.claseCuenta === ClaseCuenta.EGRESO) {
      totalEgreso = totalEgreso.plus(saldoNeto);
    }
  }

  return totalIngreso.minus(totalEgreso);
}
