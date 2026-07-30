/**
 * Recorte LIFO de aplicaciones de cobro (D-21, REQ-VTA-06 matriz fila 3) —
 * dominio puro, sin I/O.
 *
 * Cuando el monto de una venta baja POR DEBAJO de lo ya cobrado, el exceso se
 * absorbe recortando aplicaciones de la más reciente hacia atrás, en cascada.
 * Lo recortado queda como saldo no aplicado del cobro (saldo a favor del
 * cliente) por derivación pura — acá no se toca ningún cobro.
 *
 * El orden LIFO es POLÍTICA DE LA CASA (D-16/D-21): el Código Civil arts.
 * 316-318 fue verificado y NO obliga ningún default, así que este orden no
 * lleva referencia normativa a propósito.
 *
 * La función NO ordena: consume la lista en el orden recibido, que es el que
 * garantiza `VentaRepositoryPort.listarAplicaciones` (`createdAt` desc, `id`
 * desc). Ordenar acá duplicaría el criterio en dos capas que podrían divergir.
 */

import { Money } from '@/common/domain/money';

/** Proyección de `AplicacionCobro` que el recorte necesita. */
export interface AplicacionParaRecorte {
  id: string;
  cobroId: string;
  montoAplicado: Money;
}

/** Aplicación que sobrevive con un monto menor. `montoNuevo` siempre > 0. */
export interface RecorteParcial {
  aplicacion: AplicacionParaRecorte;
  montoNuevo: Money;
}

/**
 * Plan de escritura que el service ejecuta: `parciales` se actualizan,
 * `eliminadas` se borran físicamente (una aplicación en 0 no existe — el
 * schema exige `montoAplicado > 0`).
 */
export interface PlanRecorteLifo {
  parciales: RecorteParcial[];
  eliminadas: AplicacionParaRecorte[];
}

const PLAN_VACIO: PlanRecorteLifo = { parciales: [], eliminadas: [] };

export function recortarAplicacionesLifo(
  aplicacionesLifo: readonly AplicacionParaRecorte[],
  nuevoMontoTotal: Money,
): PlanRecorteLifo {
  const totalAplicado = aplicacionesLifo.reduce((acc, a) => acc.plus(a.montoAplicado), Money.ZERO);
  const excesoInicial = totalAplicado.minus(nuevoMontoTotal);
  if (!excesoInicial.isPositive()) return PLAN_VACIO;

  const parciales: RecorteParcial[] = [];
  const eliminadas: AplicacionParaRecorte[] = [];

  // Acumulador local que no escapa (§2.4): cada aplicación absorbe lo que
  // puede del exceso restante, en cascada, hasta agotarlo.
  let restante = excesoInicial;
  for (const aplicacion of aplicacionesLifo) {
    if (!restante.isPositive()) break;

    if (aplicacion.montoAplicado.lessThanOrEqualTo(restante)) {
      eliminadas.push(aplicacion);
      restante = restante.minus(aplicacion.montoAplicado);
    } else {
      parciales.push({ aplicacion, montoNuevo: aplicacion.montoAplicado.minus(restante) });
      restante = Money.ZERO;
    }
  }

  return { parciales, eliminadas };
}
