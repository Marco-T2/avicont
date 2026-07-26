/**
 * Detecta rupturas de continuidad de saldo entre importaciones CONSECUTIVAS de
 * una misma cuenta bancaria (REQ-CB-23): `saldoFinal(n) ≟ saldoInicial(n+1)`.
 *
 * **Por qué existe, si ya está el checksum de REQ-CB-08**: el checksum
 * `DERIVADO` es CIEGO a filas borradas de los EXTREMOS del archivo. Deriva el
 * saldo inicial de la primera fila presente y lo compara contra el saldo de la
 * última fila presente; si alguien elimina filas del comienzo o del final, lo
 * que queda sigue siendo un prefijo (o sufijo) internamente coherente del
 * saldo corrido del banco y la aritmética CIERRA IGUAL — devolviendo
 * `VERIFICADO` sobre un archivo mutilado. Solo el borrado del MEDIO descuadra.
 * Afecta a los cuatro perfiles `DERIVADO` (BancoSol, BMSC, Unión, Fortaleza);
 * los tres `DECLARADO` (BCP, FIE, Económico) son inmunes porque la cabecera
 * declara el inicial y el final verdaderos.
 *
 * Esta comparación es el ÚNICO mecanismo que detecta esa manipulación.
 *
 * Capacidad de DOMINIO PURO, sin I/O — mismo molde que `cobertura-extracto.ts`.
 * El veredicto se DERIVA de los saldos persistidos; no se persiste, porque
 * dejaría de ser cierto en cuanto llegue un extracto que rellene un hueco.
 */
import { Money } from '@/common/domain/money';

import type { FechaContable } from '@/common/domain/fecha-contable';

export interface ImportacionConSaldos {
  readonly id: string;
  readonly desde: FechaContable;
  readonly hasta: FechaContable;
  /** `null` cuando el archivo no lo publica o no se pudo derivar (REQ-CB-08). */
  readonly saldoInicial: Money | null;
  readonly saldoFinal: Money | null;
}

export interface Discontinuidad {
  readonly anteriorId: string;
  readonly siguienteId: string;
  readonly saldoFinalAnterior: Money;
  readonly saldoInicialSiguiente: Money;
  /** Siempre positiva — la magnitud del salto, sin dirección. */
  readonly diferencia: Money;
}

/**
 * Dos importaciones son comparables solo si la segunda arranca EXACTAMENTE el
 * día siguiente al cierre de la primera.
 *
 * - Con un HUECO en el medio los saldos no tienen por qué empalmar: ahí pasaron
 *   movimientos que ningún extracto trajo. Reportarlo como discontinuidad sería
 *   un falso positivo — el hallazgo real es el hueco, y lo cubre
 *   `detectarHuecos` (REQ-CB-09).
 * - Con SOLAPAMIENTO los dos saldos describen momentos distintos de la misma
 *   serie corrida; compararlos no significa nada.
 */
function sonContiguas(anterior: ImportacionConSaldos, siguiente: ImportacionConSaldos): boolean {
  return siguiente.desde.diferenciaEnDias(anterior.hasta) === 1;
}

export function detectarDiscontinuidades(
  importaciones: readonly ImportacionConSaldos[],
): Discontinuidad[] {
  const ordenadas = [...importaciones].sort((a, b) => a.desde.compare(b.desde));

  const discontinuidades: Discontinuidad[] = [];

  for (let i = 1; i < ordenadas.length; i += 1) {
    const anterior = ordenadas[i - 1];
    const siguiente = ordenadas[i];
    if (!anterior || !siguiente) continue;

    if (!sonContiguas(anterior, siguiente)) continue;

    const saldoFinalAnterior = anterior.saldoFinal;
    const saldoInicialSiguiente = siguiente.saldoInicial;
    // Sin dato no hay veredicto — misma regla que `SIN_VERIFICAR` (REQ-CB-08):
    // el sistema no afirma nada que no pueda respaldar.
    if (saldoFinalAnterior === null || saldoInicialSiguiente === null) continue;

    if (saldoFinalAnterior.igualaConTolerancia(saldoInicialSiguiente)) continue;

    discontinuidades.push({
      anteriorId: anterior.id,
      siguienteId: siguiente.id,
      saldoFinalAnterior,
      saldoInicialSiguiente,
      diferencia: saldoFinalAnterior.minus(saldoInicialSiguiente).abs(),
    });
  }

  return discontinuidades;
}
