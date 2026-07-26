/**
 * Derivación PURA del `estadoEfectivo` — la regla que decide qué estado se
 * MUESTRA para un movimiento bancario y para una línea contable, a partir de
 * insumos ya resueltos por el caller (REQ-CB-10/11, design D4 del informe).
 *
 * Extraída de `conciliacion.service.ts` para que TODAS las superficies que
 * pintan el puente banco↔libros — el workspace y el informe de conciliación —
 * deriven el estado con el MISMO código. Duplicarla haría que un match roto se
 * interprete distinto en dos pantallas sobre el mismo dato: divergencia
 * silenciosa, el defecto exacto que esta extracción hace imposible.
 *
 * Reglas (sin cambio de comportamiento respecto del service original):
 * - Un vínculo VÁLIDO manda sobre la columna persistida (`MovimientoBancario.
 *   estado` es una proyección cacheada, NUNCA la verdad de display).
 * - Con el vínculo ROTO (o sin match) el movimiento vuelve a `PENDIENTE`,
 *   salvo que la columna diga `IGNORADO` — ignorar es una decisión manual del
 *   usuario y se respeta.
 * - Una línea deja de estar `EN_TRANSITO` solo si un vínculo VÁLIDO la
 *   reclama: un match roto devuelve su línea al pool en la misma lectura.
 *
 * Dominio PURO, sin I/O — mismo molde que `continuidad-extractos.ts`.
 */
import type { EstadoMovimientoBancario } from '@prisma/client';

import type { MotivoVinculoRoto } from './verificar-anclas';

export type EstadoEfectivoMovimiento = 'PENDIENTE' | 'CONCILIADO' | 'IGNORADO';
export type EstadoEfectivoLinea = 'EN_TRANSITO' | 'CONCILIADO';

/** Lo único que el dominio necesita saber de un match ya verificado. */
export interface VinculoResuelto {
  /** `null` ⇒ el vínculo es válido. Cualquier otro valor ⇒ roto, con el motivo. */
  readonly roto: MotivoVinculoRoto | null;
}

/** Un vínculo es válido si existe y su ancla verificó sin motivo de rotura. */
export function esVinculoValido(vinculo: VinculoResuelto | null): boolean {
  return vinculo !== null && vinculo.roto === null;
}

/**
 * Orden deliberado: un vínculo VÁLIDO manda sobre la columna persistida; si
 * está roto, el movimiento vuelve a PENDIENTE aunque la columna diga
 * CONCILIADO (REQ-CB-11) — la columna NO es la verdad de display.
 */
export function derivarEstadoEfectivoMovimiento(
  estadoPersistido: EstadoMovimientoBancario,
  vinculo: VinculoResuelto | null,
): EstadoEfectivoMovimiento {
  if (esVinculoValido(vinculo)) return 'CONCILIADO';
  return estadoPersistido === 'IGNORADO' ? 'IGNORADO' : 'PENDIENTE';
}

/** `EN_TRANSITO` es DERIVADO — no existe fila persistida con ese estado (REQ-CB-11). */
export function derivarEstadoEfectivoLinea(
  reclamadaPorVinculoValido: boolean,
): EstadoEfectivoLinea {
  return reclamadaPorVinculoValido ? 'CONCILIADO' : 'EN_TRANSITO';
}
