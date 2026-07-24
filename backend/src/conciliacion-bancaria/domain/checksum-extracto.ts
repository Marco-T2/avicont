/**
 * Verifica el saldo de un extracto según su `EstrategiaChecksum` (REQ-CB-08,
 * design §4.2). Consume la lista de movimientos YA ORDENADA por
 * `ordenarCanonico` — no reordena. Informativo, NUNCA rechaza la importación
 * (decisión 3): el resultado es `VERIFICADO | SIN_VERIFICAR | DESCUADRE`.
 *
 * - **DECLARADO**: el archivo trae saldo inicial/final en la cabecera.
 *   `saldoInicialDeclarado + Σ(±montos) ≟ saldoFinalDeclarado`.
 * - **DERIVADO**: se deriva el saldo inicial de la fila más antigua (primer
 *   elemento del array, que YA está en orden canónico):
 *   `saldoInicial = saldo(primero) ∓ monto(primero)` según su lado — un
 *   CREDITO sumó al saldo corrido, así que antes de él el saldo era menor
 *   (se resta); un DEBITO restó, así que antes era mayor (se suma). Luego
 *   `saldoInicial + Σ(±montos) ≟ saldo(último)`.
 * - **IMPOSIBLE**: el formato no trae columna de saldo. Siempre
 *   `SIN_VERIFICAR` — el sistema nunca finge que verificó algo que no puede.
 *
 * `±montos`: un CREDITO (perspectiva del banco) suma al saldo, un DEBITO
 * resta — es la misma dirección que usa el banco para correr su columna
 * "saldo" fila a fila.
 */
import type { EstadoVerificacionExtracto } from '@prisma/client';

import { Money } from '@/common/domain/money';

import type { EstrategiaChecksum, MovimientoParseado } from '../ports/extracto-parser.port';

export interface ResultadoChecksum {
  readonly estadoVerificacion: EstadoVerificacionExtracto;
  readonly diferencia: Money | null;
}

export interface DatosChecksumDeclarado {
  readonly saldoInicialDeclarado: Money | null;
  readonly saldoFinalDeclarado: Money | null;
}

const SIN_VERIFICAR: ResultadoChecksum = { estadoVerificacion: 'SIN_VERIFICAR', diferencia: null };

function netoMovimientos(movimientos: readonly MovimientoParseado[]): Money {
  return movimientos.reduce(
    (acumulado, m) => (m.tipo === 'CREDITO' ? acumulado.plus(m.monto) : acumulado.minus(m.monto)),
    Money.ZERO,
  );
}

function compararContraEsperado(saldoEsperado: Money, saldoReal: Money): ResultadoChecksum {
  if (saldoEsperado.igualaConTolerancia(saldoReal)) {
    return { estadoVerificacion: 'VERIFICADO', diferencia: null };
  }
  return { estadoVerificacion: 'DESCUADRE', diferencia: saldoEsperado.minus(saldoReal).abs() };
}

export function verificarChecksum(
  estrategia: EstrategiaChecksum,
  movimientosOrdenados: readonly MovimientoParseado[],
  datos: DatosChecksumDeclarado,
): ResultadoChecksum {
  if (estrategia === 'IMPOSIBLE') {
    return SIN_VERIFICAR;
  }

  if (movimientosOrdenados.length === 0) {
    return SIN_VERIFICAR;
  }

  if (estrategia === 'DECLARADO') {
    const { saldoInicialDeclarado, saldoFinalDeclarado } = datos;
    if (saldoInicialDeclarado === null || saldoFinalDeclarado === null) {
      return SIN_VERIFICAR;
    }
    const saldoEsperado = saldoInicialDeclarado.plus(netoMovimientos(movimientosOrdenados));
    return compararContraEsperado(saldoEsperado, saldoFinalDeclarado);
  }

  // DERIVADO
  const [primero] = movimientosOrdenados;
  const ultimo = movimientosOrdenados[movimientosOrdenados.length - 1];
  if (!primero || !ultimo || primero.saldo === null || ultimo.saldo === null) {
    return SIN_VERIFICAR;
  }
  const saldoInicial =
    primero.tipo === 'CREDITO'
      ? primero.saldo.minus(primero.monto)
      : primero.saldo.plus(primero.monto);
  const saldoEsperado = saldoInicial.plus(netoMovimientos(movimientosOrdenados));
  return compararContraEsperado(saldoEsperado, ultimo.saldo);
}
