/**
 * Cartera de cuentas por cobrar (REQ-CXC-01) — dominio puro, TODO DERIVADO.
 *
 * Nada de lo que calcula este archivo se persiste (Anti-05): ni el saldo, ni
 * el estado comercial, ni la condición VENCIDA. Se derivan en cada lectura a
 * partir de lo que el repositorio ya leyó (`montoTotal`, Σ `montoAplicado`) y
 * de "hoy", que el SERVICE obtiene de `ClockPort.currentDateLaPaz()` y eleva
 * con `FechaContable.fromIso` — el dominio recibe la fecha como parámetro y
 * NUNCA llama `new Date()` (§4.6, Anti-20).
 *
 * El estado comercial es ORTOGONAL al estado contable del comprobante y al
 * flag `anulado` (D-02): acá no existe ningún enum combinado. Qué ventas
 * INTEGRAN la cartera (`condicionPago = CREDITO` ∧ `estado IN (CONTABILIZADO,
 * BLOQUEADO)` ∧ `anulado = false`) lo filtra `CarteraReaderPort.listarVentasDeCartera`
 * — este archivo deriva sobre las que ya integran.
 *
 * NO confundir con `listarVentasEnCartera` del repositorio de `ventas`: ese
 * método NO filtra `condicionPago`, así que consumirlo acá colaría las ventas
 * CONTADO al estado de cuenta, que es justo lo que REQ-VTA-04 prohíbe.
 */

import { FechaContable } from '@/common/domain/fecha-contable';
import { Money } from '@/common/domain/money';

// ============================================================
// Estado comercial
// ============================================================

/**
 * Derivado del saldo, nunca almacenado. La unión vive acá (y no en Prisma) a
 * propósito: un enum persistido invitaría a escribirlo en una columna.
 */
export const ESTADOS_COMERCIALES_VENTA = ['ABIERTA', 'PARCIAL', 'SALDADA'] as const;
export type EstadoComercialVenta = (typeof ESTADOS_COMERCIALES_VENTA)[number];

/**
 * `saldoPendiente = montoTotal − Σ montoAplicado` (REQ-CXC-01).
 *
 * Sin `redondearABob()`: ambos operandos llegan PERSISTIDOS con 2 decimales
 * (§4.5 — los redondeó quien los calculó) y la resta de dos valores de 2
 * decimales es exacta. Re-redondear acá enmascararía un input corrupto.
 */
export function saldoPendiente(montoTotal: Money, totalAplicado: Money): Money {
  return montoTotal.minus(totalAplicado);
}

/**
 * ABIERTA (nada aplicado) | PARCIAL (algo aplicado, saldo > 0) | SALDADA
 * (saldo 0). Si el invariante REQ-CXC-04 se violó (Σ aplicado > total), la
 * lectura NO revienta: se lee SALDADA — la corrupción la detectan los tests
 * de integridad, no un 500 en el estado de cuenta.
 */
export function estadoComercial(montoTotal: Money, totalAplicado: Money): EstadoComercialVenta {
  if (totalAplicado.isZero()) return 'ABIERTA';
  if (!saldoPendiente(montoTotal, totalAplicado).isPositive()) return 'SALDADA';
  return 'PARCIAL';
}

// ============================================================
// Vencimiento
// ============================================================

/**
 * `VENCIDA = fechaVencimiento < hoy AND saldoPendiente > 0` (REQ-CXC-01).
 * Estrictamente menor: el día del vencimiento la venta NO está vencida.
 *
 * `fechaVencimiento` es NO-nullable a propósito: solo las ventas CREDITO
 * integran la cartera (D-04) y CREDITO exige vencimiento (REQ-VTA-02) — el
 * tipo encarna esa regla en vez de repartir un `?? null` por los callers.
 */
export function estaVencida(
  fechaVencimiento: FechaContable,
  hoy: FechaContable,
  saldo: Money,
): boolean {
  return fechaVencimiento.isBefore(hoy) && saldo.isPositive();
}

/**
 * Días de atraso (REQ-CXC-07): calendario puro entre el vencimiento y hoy.
 * Una venta no vencida (incluida la saldada) informa 0 — el atraso es una
 * propiedad de la deuda viva, no un contador histórico.
 */
export function diasAtraso(
  fechaVencimiento: FechaContable,
  hoy: FechaContable,
  saldo: Money,
): number {
  if (!estaVencida(fechaVencimiento, hoy, saldo)) return 0;
  return hoy.diferenciaEnDias(fechaVencimiento);
}

// ============================================================
// Orden canónico FIFO
// ============================================================

/** Proyección mínima que el orden canónico necesita. */
export interface VentaOrdenCartera {
  id: string;
  fechaContable: FechaContable;
  /** Timestamp de registro leído de la BD — acá es DATO, no reloj (Anti-20). */
  createdAt: Date;
}

/**
 * Orden canónico FIFO por antigüedad (REQ-CXC-05): el que publica el backend
 * en el listado de ventas abiertas y sobre el que el frontend auto-tilda —
 * nunca lo recalcula ni lo convierte en auto-match (B-9).
 *
 * FIFO es POLÍTICA DE LA CASA (D-16): el Código Civil arts. 316-318 fue
 * verificado y NO obliga ningún default, así que este orden no lleva
 * referencia normativa a propósito.
 *
 * ## Desempate — por qué estos criterios y en este orden
 *
 * 1. `fechaContable` asc — la antigüedad de la deuda es la fecha del hecho
 *    económico (la que envejece la deuda y ve el contador), NO la fecha de
 *    registro: una venta backdateada es más vieja aunque se cargó ayer.
 * 2. `createdAt` asc — dos ventas del mismo día se cobran en el orden en que
 *    se registraron: espejo exacto (invertido) del LIFO de aplicaciones
 *    (`createdAt` desc de `listarAplicaciones`), un solo criterio de
 *    "antigüedad dentro del día" en todo el flujo comercial.
 * 3. `id` asc — `timestamptz(3)` tiene precisión de milisegundo y un alta en
 *    lote puede colisionar; sin este último desempate el "orden canónico que
 *    publica el backend" dependería del plan de ejecución de Postgres y dos
 *    lecturas podrían publicar órdenes distintos.
 */
export function ordenarCarteraFifo<T extends VentaOrdenCartera>(ventas: readonly T[]): T[] {
  return [...ventas].sort((a, b) => {
    const porFecha = a.fechaContable.compare(b.fechaContable);
    if (porFecha !== 0) return porFecha;

    const porRegistro = a.createdAt.getTime() - b.createdAt.getTime();
    if (porRegistro !== 0) return porRegistro;

    if (a.id < b.id) return -1;
    if (a.id > b.id) return 1;
    return 0;
  });
}
