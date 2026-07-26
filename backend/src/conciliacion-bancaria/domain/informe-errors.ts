/**
 * Errores de dominio del INFORME de conciliación bancaria
 * (change `informe-conciliacion-bancaria`). Los `code` son IDs ESTABLES hacia
 * el cliente, formato `CONCILIACION_{SUBDOMINIO}_{CONDICION}` (CLAUDE.md §6.3).
 */

import { InvalidStateError } from '@/common/errors';

/**
 * REQ-ICB-01: el lado libros y el lado banco no son comparables sin un tipo de
 * cambio único, que no existe — v1 solo concilia cuentas en BOB. Aplica tanto
 * a consultar el informe como a declarar un arranque: un arranque sobre una
 * cuenta no conciliable fijaría un punto de partida que ningún informe podrá
 * usar.
 */
export class ConciliacionMonedaNoSoportadaError extends InvalidStateError {
  constructor(cuentaBancariaId: string, moneda: string) {
    super(
      'CONCILIACION_MONEDA_NO_SOPORTADA',
      'El informe de conciliación solo soporta cuentas bancarias en BOB',
      { cuentaBancariaId, moneda },
    );
  }
}

/**
 * REQ-ICB-04: al declarar un arranque el cliente confirma cuáles de las
 * partidas abiertas propuestas se arrastran, por referencia. Una referencia
 * que ya no existe entre los candidatos significa que la pantalla estaba
 * mirando una foto anterior de la cuenta —llegó un extracto, se concilió un
 * movimiento, se editó un asiento— y declarar el punto de partida sobre datos
 * vencidos es exactamente lo que este acto no puede permitirse.
 *
 * Se falla fuerte en vez de descartar en silencio: un arranque con partidas
 * de menos produce informes que cierran de mentira.
 */
export class PartidasDeArranqueDesconocidasError extends InvalidStateError {
  constructor(referencias: readonly string[]) {
    super(
      'CONCILIACION_ARRANQUE_PARTIDAS_DESCONOCIDAS',
      'Algunas partidas confirmadas ya no figuran entre las abiertas a esa fecha: volvé a abrir la declaración para ver la lista actualizada',
      { referencias: [...referencias] },
    );
  }
}

/**
 * REQ-ICB-04: anular una declaración de arranque es un acto que se registra
 * UNA vez, con su motivo y su autor. Re-anular pisaría ese rastro, así que el
 * segundo intento se rechaza en vez de pasar como idempotente.
 *
 * Cubre también la carrera: dos anulaciones simultáneas resuelven en el
 * `updateMany` con predicado `anulado = false`, y la que pierde llega acá.
 */
export class ArranqueYaAnuladoError extends InvalidStateError {
  constructor(arranqueId: string) {
    super('CONCILIACION_ARRANQUE_YA_ANULADO', 'Esa declaración de arranque ya está anulada', {
      arranqueId,
    });
  }
}
