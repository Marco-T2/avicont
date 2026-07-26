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
