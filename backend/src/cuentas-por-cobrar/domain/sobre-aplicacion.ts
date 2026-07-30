/**
 * Invariante de sobre-aplicación (REQ-CXC-04, B-6, cicatriz F-03) — la parte
 * PURA. Dadas las sumas ya leídas y el monto que se quiere aplicar, decide si
 * excede el cobro o la venta y lanza el error correspondiente.
 *
 * ```
 * Σ montoAplicado(cobro)  ≤  cobro.monto
 * Σ montoAplicado(venta)  ≤  venta.montoTotal
 * ```
 *
 * ## Cómo la compone el service (Anti-11/Anti-12: check-then-act sobre plata)
 *
 * La MISMA función corre dos veces por escritura de aplicaciones:
 *
 * 1. **Pre-TX** (fail fast, error amigable) con las sumas leídas sueltas.
 * 2. **Intra-TX** con las sumas re-leídas por `SELECT SUM(...)` bajo
 *    `FOR UPDATE` sobre el cobro y la venta — eso lo hace el repositorio; acá
 *    solo se decide. Dos aplicaciones concurrentes al mismo cobro: exactamente
 *    una commitea, la otra ve la suma del primero y rechaza.
 *
 * ## Contrato de las sumas
 *
 * - Al CREAR: `totalAplicado` = Σ de todas las aplicaciones existentes.
 * - Al EDITAR una aplicación: las sumas EXCLUYEN la aplicación que se está
 *   editando (su monto viejo ya no cuenta; el nuevo es `montoAplicar`).
 */

import { Money } from '@/common/domain/money';
import { InvalidStateError } from '@/common/errors';

import {
  AplicacionContactoDistintoError,
  AplicacionExcedeCobroError,
  AplicacionExcedeVentaError,
} from './cobro-errors';

/**
 * `montoAplicado > 0` (REQ-CXC-03). Vive acá, junto a la regla que lo
 * necesita: un monto 0 crea un vínculo que no existe (el schema lo prohíbe) y
 * un NEGATIVO "libera" cupo en las sumas y sobre-aplica plata en silencio —
 * por eso el guard es de dominio y no solo del DTO (§4.2 defense in depth).
 * Code: APLICACION_MONTO_NO_POSITIVO — 422.
 */
export class AplicacionMontoNoPositivoError extends InvalidStateError {
  constructor(montoBob: string) {
    super('APLICACION_MONTO_NO_POSITIVO', 'El monto a aplicar debe ser mayor a cero', {
      montoBob,
    });
  }
}

/** Sumas ya leídas por el repositorio — este módulo no hace I/O. */
export interface SumasAplicacion {
  cobro: {
    id: string;
    monto: Money;
    /** Σ `montoAplicado` de las aplicaciones del cobro (ver contrato arriba). */
    totalAplicado: Money;
  };
  venta: {
    id: string;
    montoTotal: Money;
    /** Σ `montoAplicado` de las aplicaciones de la venta (ver contrato arriba). */
    totalAplicado: Money;
  };
}

/**
 * Lanza `AplicacionExcedeCobroError` / `AplicacionExcedeVentaError` (422) si
 * aplicar `montoAplicar` violaría alguno de los dos invariantes. El cobro se
 * chequea PRIMERO: es la plata que el usuario está repartiendo en la pantalla
 * de cobro, así que su límite es el error más accionable cuando ambos exceden.
 *
 * El límite es EXACTO (≤, sin tolerancia): aplicar el disponible completo es
 * válido; excederse por Bs 0.01 rechaza.
 */
export function verificarSobreAplicacion(sumas: SumasAplicacion, montoAplicar: Money): void {
  if (!montoAplicar.isPositive()) {
    throw new AplicacionMontoNoPositivoError(montoAplicar.toBob());
  }

  if (sumas.cobro.totalAplicado.plus(montoAplicar).greaterThan(sumas.cobro.monto)) {
    throw new AplicacionExcedeCobroError(
      sumas.cobro.id,
      sumas.cobro.monto,
      sumas.cobro.totalAplicado,
      montoAplicar,
    );
  }

  if (sumas.venta.totalAplicado.plus(montoAplicar).greaterThan(sumas.venta.montoTotal)) {
    throw new AplicacionExcedeVentaError(
      sumas.venta.id,
      sumas.venta.montoTotal,
      sumas.venta.totalAplicado,
      montoAplicar,
    );
  }
}

/**
 * Ambas puntas de una aplicación DEBEN ser del mismo cliente (REQ-CXC-03).
 * Corre en toda escritura de aplicaciones, junto a `verificarSobreAplicacion`.
 */
export function verificarMismoContacto(contactoCobroId: string, contactoVentaId: string): void {
  if (contactoCobroId !== contactoVentaId) {
    throw new AplicacionContactoDistintoError(contactoCobroId, contactoVentaId);
  }
}
