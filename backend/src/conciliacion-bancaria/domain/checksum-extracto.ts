/**
 * Verifica el saldo de un extracto según su `EstrategiaChecksum` (REQ-CB-08,
 * design §4.2). Informativo, NUNCA rechaza la importación (decisión 3): el
 * resultado es `VERIFICADO | SIN_VERIFICAR | DESCUADRE`.
 *
 * **La lista que consume DEBE venir en orden CRONOLÓGICO** (`ordenarCronologico`,
 * derivado del orden físico del archivo), NO en orden canónico. El orden
 * canónico ordena por `fecha → monto → …` e ignora la hora a propósito, así
 * que su primer elemento es el de menor monto del día más antiguo y no el que
 * ocurrió primero. Anclar el saldo ahí produce descuadres FANTASMA sobre datos
 * correctos — ver el caso Fortaleza documentado en `orden-cronologico.ts`.
 * `DECLARADO` es inmune (lee los saldos de la cabecera), pero recibe la misma
 * lista para no tener dos contratos distintos.
 *
 * - **DECLARADO**: el archivo trae saldo inicial/final en la cabecera.
 *   `saldoInicialDeclarado + Σ(±montos) ≟ saldoFinalDeclarado`.
 * - **DERIVADO**: se deriva el saldo inicial de la fila más antigua (primer
 *   elemento del array, que YA está en orden cronológico):
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
  /**
   * Saldos que la verificación USÓ, devueltos para que la importación los
   * persista (REQ-CB-08). En `DECLARADO` son los de la cabecera; en `DERIVADO`
   * el derivado de la fila cronológicamente primera y el saldo corrido de la
   * última. Son datos REALES observados del banco, no estimaciones.
   *
   * `null` cuando no se pudieron establecer (`IMPOSIBLE`, secuencia no
   * monótona, lista vacía o el archivo no publica saldo): el sistema NUNCA
   * inventa un saldo que no observó — misma regla que `SIN_VERIFICAR`.
   *
   * Sin ellos no se puede verificar la continuidad entre importaciones
   * (REQ-CB-23) ni fijar el punto de arranque del informe de conciliación:
   * un `DESCUADRE` los devuelve IGUAL, porque el archivo los publicó aunque
   * su aritmética no cierre.
   */
  readonly saldoInicial: Money | null;
  readonly saldoFinal: Money | null;
}

export interface DatosChecksumDeclarado {
  readonly saldoInicialDeclarado: Money | null;
  readonly saldoFinalDeclarado: Money | null;
}

const SIN_VERIFICAR: ResultadoChecksum = {
  estadoVerificacion: 'SIN_VERIFICAR',
  diferencia: null,
  saldoInicial: null,
  saldoFinal: null,
};

function netoMovimientos(movimientos: readonly MovimientoParseado[]): Money {
  return movimientos.reduce(
    (acumulado, m) => (m.tipo === 'CREDITO' ? acumulado.plus(m.monto) : acumulado.minus(m.monto)),
    Money.ZERO,
  );
}

/**
 * `saldoInicial`/`saldoFinal` son los que la estrategia USÓ y viajan en el
 * resultado con independencia del veredicto: un descuadre no los invalida
 * (el archivo los publicó igual), solo dice que la aritmética entre ellos
 * no cierra.
 */
function compararContraEsperado(
  saldoEsperado: Money,
  saldoReal: Money,
  saldos: { saldoInicial: Money; saldoFinal: Money },
): ResultadoChecksum {
  if (saldoEsperado.igualaConTolerancia(saldoReal)) {
    return { estadoVerificacion: 'VERIFICADO', diferencia: null, ...saldos };
  }
  return {
    estadoVerificacion: 'DESCUADRE',
    diferencia: saldoEsperado.minus(saldoReal).abs(),
    ...saldos,
  };
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
    return compararContraEsperado(saldoEsperado, saldoFinalDeclarado, {
      saldoInicial: saldoInicialDeclarado,
      saldoFinal: saldoFinalDeclarado,
    });
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
  // `ultimo.saldo` es el saldo corrido de la última fila PRESENTE en el
  // archivo — no necesariamente el cierre real del período si al archivo le
  // faltan filas del final. Esa ceguera es justamente lo que detecta la
  // continuidad entre importaciones (REQ-CB-23).
  return compararContraEsperado(saldoEsperado, ultimo.saldo, {
    saldoInicial,
    saldoFinal: ultimo.saldo,
  });
}
