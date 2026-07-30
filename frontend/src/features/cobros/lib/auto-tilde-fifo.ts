import { aCentavosSeguro, deCentavos } from './dinero-centavos';

// REQ-CXC-05: FIFO sugiere, el usuario decide, el backend valida.
//
// El orden canónico de antigüedad lo publica el BACKEND en el array `ventas`
// del estado de cuenta (fechaContable asc → createdAt asc → id asc, con
// re-aplicación defensiva en estado-cuenta.service.ts). Este módulo auto-tilda
// sobre ESE orden tal cual llega: NO reordena, NO compara fechas, NO
// "corrige" nada (B-9, Anti-18/Anti-01). El test "respeta el orden del array
// aunque contradiga el orden por fecha" congela esta regla — si alguien mete
// un sort acá, ese test se pone rojo.

/**
 * Punta mínima de una venta abierta para el reparto. Estructuralmente
 * compatible con `VentaEstadoCuenta` — la página pasa los DTOs tal cual.
 */
export interface VentaParaReparto {
  ventaId: string;
  /** Decimal(18,2) string (§4.5). */
  saldoPendiente: string;
}

/**
 * Una fila de la pantalla de cobro: sugerida por FIFO, SIEMPRE destildable y
 * con monto editable. La sugerencia nunca viaja implícita: el payload final
 * lleva las aplicaciones explícitas (venta + monto por fila tildada).
 */
export interface FilaAplicacion {
  ventaId: string;
  tildada: boolean;
  /** Decimal(18,2) string; '' cuando la fila no está tildada. */
  montoAplicado: string;
}

/**
 * Reparte `montoCobro` sobre las ventas EN EL ORDEN DEL ARRAY, de la primera
 * hacia adelante: a cada una le asigna min(restante, saldoPendiente).
 * - Nunca asigna más que el saldo de la fila ni más que el monto del cobro.
 * - Lo que sobra tras la última venta NO se asigna (queda como saldo a favor).
 * - Monto inválido o cero → ninguna fila tildada.
 * No muta `ventas` (§2.4: mutación de parámetros PROHIBIDA).
 */
export function autoTildeFifo(
  ventas: readonly VentaParaReparto[],
  montoCobro: string,
): FilaAplicacion[] {
  let restante = aCentavosSeguro(montoCobro) ?? 0n;

  return ventas.map((venta) => {
    const saldo = aCentavosSeguro(venta.saldoPendiente) ?? 0n;
    const asignado = restante < saldo ? restante : saldo;
    restante -= asignado;

    return asignado > 0n
      ? { ventaId: venta.ventaId, tildada: true, montoAplicado: deCentavos(asignado) }
      : { ventaId: venta.ventaId, tildada: false, montoAplicado: '' };
  });
}

export interface ResumenReparto {
  /** Σ de los montos de las filas tildadas (los inválidos cuentan 0). */
  totalAplicado: string;
  /** montoCobro − totalAplicado; '0.00' si el total excede el monto. */
  sinAplicar: string;
  /** true si lo tildado supera el monto del cobro — el backend lo rechazaría. */
  excedeMonto: boolean;
}

/**
 * Totales derivados del reparto actual (sugerido u overrideado por el usuario).
 * `sinAplicar` es lo que colapsa a saldo a favor del cliente (REQ-CXC-02).
 */
export function resumenReparto(
  montoCobro: string,
  filas: readonly FilaAplicacion[],
): ResumenReparto {
  const monto = aCentavosSeguro(montoCobro) ?? 0n;
  const total = filas
    .filter((f) => f.tildada)
    .reduce((acc, f) => acc + (aCentavosSeguro(f.montoAplicado) ?? 0n), 0n);
  const resto = monto - total;

  return {
    totalAplicado: deCentavos(total),
    sinAplicar: resto >= 0n ? deCentavos(resto) : '0.00',
    excedeMonto: total > monto,
  };
}

/**
 * Sugerencia al tildar manualmente una fila que la sugerencia dejó fuera:
 * min(saldo de la venta, lo que queda sin aplicar del cobro). '' si no queda
 * nada — el usuario escribe el monto a mano.
 */
export function sugerirMontoParaFila(
  montoCobro: string,
  filas: readonly FilaAplicacion[],
  saldoPendiente: string,
): string {
  const { sinAplicar, excedeMonto } = resumenReparto(montoCobro, filas);
  if (excedeMonto) return '';
  const resto = aCentavosSeguro(sinAplicar) ?? 0n;
  const saldo = aCentavosSeguro(saldoPendiente) ?? 0n;
  const sugerido = resto < saldo ? resto : saldo;
  return sugerido > 0n ? deCentavos(sugerido) : '';
}
