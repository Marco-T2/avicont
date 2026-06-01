import { Decimal } from '@prisma/client/runtime/library';

import { NaturalezaCuenta } from '@/common/domain/enums';

import { Money } from '@/common/domain/money';

type DecimalInput = string | Decimal | Money;

/**
 * Saldo neto de una cuenta según su naturaleza contable.
 *
 * DEUDORA: saldo = debe − haber (activos/egresos aumentan con débito).
 * ACREEDORA: saldo = haber − debe (pasivos/patrimonio/ingresos aumentan con crédito).
 *
 * Código Tributario art. 47: la naturaleza determina el signo del saldo.
 * NCB plan analítico boliviano: DEUDORA aumenta con DEBE, ACREEDORA con HABER.
 *
 * Un saldo negativo es válido (ej. descubierto bancario en cuenta DEUDORA).
 * Función pura sin dependencias de NestJS ni Prisma — testeable en aislamiento.
 */
export function calcularSaldoNeto(
  totalDebitoBob: DecimalInput,
  totalCreditoBob: DecimalInput,
  naturaleza: NaturalezaCuenta,
): Money {
  const debe = Money.of(totalDebitoBob);
  const haber = Money.of(totalCreditoBob);
  // Código Tributario art. 47: la naturaleza determina el signo del saldo.
  return naturaleza === NaturalezaCuenta.DEUDORA ? debe.minus(haber) : haber.minus(debe);
}
