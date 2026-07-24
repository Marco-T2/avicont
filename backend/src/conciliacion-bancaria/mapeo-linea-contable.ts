/**
 * Mapeo de BOUNDARY entre la proyección `LineaCuentaRow` (puerto de
 * `comprobantes/`) y los tipos del dominio puro de conciliación
 * (`verificar-anclas`, `motor-sugerencias`). Vive fuera de `domain/` porque
 * conoce el shape del puerto — el dominio no debe conocerlo.
 *
 * Compartido por `ConciliacionService` (workspace) y `MatchConciliacionService`
 * (confirmar/deshacer) para que la verificación del ancla sea LA MISMA en la
 * lectura y en la escritura — si divergieran, un match podría verse roto en el
 * panel y sano al confirmar contra él.
 */

import type { LineaCuentaRow } from '@/comprobantes/ports/lineas-cuenta-reader.port';
import { FechaContable } from '@/common/domain/fecha-contable';
import { Money } from '@/common/domain/money';
import type { LadoContable, MatchConciliacion } from '@prisma/client';

import type { LineaContableActual, SnapshotAncla } from './domain/verificar-anclas';

/** Clave del Map de anclas. Unit Separator: ningún uuid ni entero lo contiene. */
export function claveAncla(comprobanteId: string, orden: number): string {
  return `${comprobanteId}${orden}`;
}

/**
 * Una línea contable tiene débito XOR crédito (invariante §4.1 core). El lado
 * y el monto positivo salen de cuál de los dos es distinto de cero.
 */
export function ladoYMonto(fila: LineaCuentaRow): {
  tipo: LadoContable;
  monto: Money;
  montoBob: Money;
} {
  const debito = Money.of(fila.debito);
  return debito.isZero()
    ? { tipo: 'CREDITO', monto: Money.of(fila.credito), montoBob: Money.of(fila.creditoBob) }
    : { tipo: 'DEBITO', monto: debito, montoBob: Money.of(fila.debitoBob) };
}

export function aLineaContableActual(fila: LineaCuentaRow): LineaContableActual {
  const { tipo, monto } = ladoYMonto(fila);
  return {
    cuentaId: fila.cuentaId,
    monto,
    tipo,
    moneda: fila.moneda,
    fecha: FechaContable.fromDbDate(fila.fechaContable),
    anulado: fila.anulado,
  };
}

export function aSnapshot(match: MatchConciliacion): SnapshotAncla {
  return {
    cuentaId: match.snapshotCuentaId,
    monto: Money.of(match.snapshotMonto),
    tipo: match.snapshotTipo,
    moneda: match.snapshotMoneda,
    fecha: FechaContable.fromDbDate(match.snapshotFecha),
  };
}
