import { NaturalezaCuenta } from '@/common/domain/enums';
import { Money } from '@/common/domain/money';

export type LadoAsiento = 'DEBE' | 'HABER';

export interface AporteCierre {
  lado: LadoAsiento;
  monto: Money;
}

/**
 * Calcula el aporte de cierre de una cuenta hoja de resultado: el lado y el
 * monto de la línea que la lleva a cero.
 *
 * Ley 843 art. 46 + Código Tributario art. 47: cierre de cuentas de resultado y
 * traslado a patrimonio; partida doble débito=crédito. La `naturaleza` que llega
 * es la EFECTIVA (la BD ya resuelve `esContraria`: una cuenta contraria guarda la
 * naturaleza opuesta a su clase).
 *
 *   net = (naturaleza === ACREEDORA) ? credito − debito : debito − credito
 *
 *   - `net > 0` (saldo normal en su naturaleza) → línea al lado OPUESTO a la
 *     naturaleza, por `net`, para llevar la cuenta a cero.
 *   - `net < 0` (anomalía: saldo contrario a la naturaleza) → línea al MISMO lado
 *     que la naturaleza, por `|net|` (igual la lleva a cero).
 *   - `net === 0` → `null` (sin saldo neto; no aporta línea — SKIP).
 *
 * Función pura: sin NestJS ni Prisma, testeable en aislamiento.
 */
export function netDe(
  debitoBob: Money,
  creditoBob: Money,
  naturaleza: NaturalezaCuenta,
): AporteCierre | null {
  const net =
    naturaleza === NaturalezaCuenta.ACREEDORA
      ? creditoBob.minus(debitoBob)
      : debitoBob.minus(creditoBob);

  if (net.isZero()) {
    return null;
  }

  const ladoOpuesto: LadoAsiento = naturaleza === NaturalezaCuenta.ACREEDORA ? 'DEBE' : 'HABER';
  const ladoMismo: LadoAsiento = naturaleza === NaturalezaCuenta.ACREEDORA ? 'HABER' : 'DEBE';

  return net.isPositive()
    ? { lado: ladoOpuesto, monto: net }
    : { lado: ladoMismo, monto: net.abs() };
}
