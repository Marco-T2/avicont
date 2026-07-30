/**
 * Read-surface PROPIA de `cuentas-por-cobrar` sobre la cartera de un contacto
 * (§3.7: cada módulo define su proyección; molde `VentaSnapshotsReaderPort`).
 *
 * La cartera se DERIVA, no se almacena (REQ-CXC-01, Anti-05): este port
 * devuelve DATOS CRUDOS — cada partida con su monto y su Σ aplicado — y el
 * cálculo de `saldoPendiente`, estado comercial, `VENCIDA` y días de atraso
 * vive en `domain/cartera.ts`. Por eso las filas incluyen también las ventas
 * ya saldadas (Σ aplicado == montoTotal): filtrar por saldo acá duplicaría la
 * derivación del dominio.
 *
 * Qué integra la cartera (predicado completo, las tres piezas):
 *
 *   1. `condicionPago = CREDITO` — una venta CONTADO no crea partida abierta
 *      (REQ-VTA-04 / D-04). NO alcanza con filtrar por `contactoId`: la línea
 *      de débito del asiento de una venta CONTADO también lleva `contactoId`
 *      (el Mayor de Caja documenta quién pagó), así que cualquier lectura por
 *      contacto a secas colaría las ventas al contado en el estado de cuenta.
 *   2. Comprobante con `estado IN (CONTABILIZADO, BLOQUEADO)` — los DOS
 *      (`ESTADOS_CONCILIABLES`, §4.4): cerrar un período pasa sus
 *      comprobantes a `BLOQUEADO` y filtrar por `CONTABILIZADO` a secas
 *      vaciaría el estado de cuenta el día del cierre, con las deudas
 *      intactas.
 *   3. `anulado = false` — la anulada sale del estado de cuenta (§4.7,
 *      REQ-CXC-07).
 *
 * Montos como `Money` (§4.5): los `Decimal` de Prisma NO cruzan este boundary
 * (precedente `CierreSaldosReaderPort`). Fechas como `Date` crudo de
 * `@db.Date` — se elevan con `FechaContable.fromDbDate` en el boundary del
 * servicio (mismo criterio que `LineaCuentaRow`).
 */

import type { Prisma } from '@prisma/client';

import type { Money } from '@/common/domain/money';

export const CARTERA_READER_PORT = Symbol('CARTERA_READER_PORT');

/** Partida abierta candidata: la venta a crédito ES la partida (D-07). */
export interface VentaCarteraRow {
  ventaId: string;
  /** `@db.Date` — calendario puro (§4.6). */
  fechaContable: Date;
  /**
   * `Date | null` porque el schema lo permite: el writer valida
   * CREDITO ⇒ vencimiento, pero el tipo de la columna no lo garantiza. El
   * dominio trata `null` como "sin vencimiento" (nunca VENCIDA), no revienta.
   */
  fechaVencimiento: Date | null;
  /**
   * Timestamp de registro — materia prima del desempate FIFO. Viaja en la
   * fila para que el servicio pueda aplicar `ordenarCarteraFifo` del dominio
   * (la regla canónica) sin re-consultar; el `ORDER BY` del adapter ya
   * publica ese mismo orden.
   */
  createdAt: Date;
  montoTotal: Money;
  /** Σ `montoAplicado` de sus aplicaciones vigentes. `Money.ZERO` si no tiene. */
  totalAplicado: Money;
}

/** Cobro con su Σ aplicado, para derivar el saldo a favor (REQ-CXC-07). */
export interface CobroCarteraRow {
  cobroId: string;
  monto: Money;
  /** Σ `montoAplicado` de sus aplicaciones vigentes. `Money.ZERO` si no tiene. */
  totalAplicado: Money;
}

export abstract class CarteraReaderPort {
  /**
   * Ventas de la cartera de un contacto — a crédito, con comprobante
   * conciliable y no anulado (predicado completo en el header).
   *
   * Orden CANÓNICO de antigüedad (REQ-CXC-05: lo publica el backend y el
   * frontend auto-tilda FIFO sobre él, no lo recalcula):
   * `fechaContable ASC, createdAt ASC, id ASC`.
   *
   * Por qué ese desempate: `fechaContable` es la antigüedad del documento
   * (la clave FIFO); entre dos ventas del mismo día, "la más vieja" es la que
   * se registró primero (`createdAt`); y `id` cierra el orden total porque
   * `createdAt` tiene precisión de milisegundos y dos ventas creadas en la
   * misma transacción pueden compartir timestamp — sin el tercer término, el
   * mismo conjunto podría salir en órdenes distintos en dos requests y el
   * auto-tilde FIFO del frontend cambiaría de destino entre pantallas. NO se
   * desempata por `numero` del comprobante: mover `fechaContable` de mes
   * conserva el número original (§4.3), así que el número puede contradecir
   * la antigüedad real del documento.
   *
   * Multi-tenant: `organizationId` en la query de ventas Y en la de
   * comprobantes Y en la Σ de aplicaciones (defense in depth, §4.2/Anti-31).
   */
  abstract listarVentasDeCartera(
    tenantId: string,
    contactoId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<VentaCarteraRow[]>;

  /**
   * Cobros del contacto con su Σ aplicado — insumo del saldo a favor
   * (Σ (monto − aplicado), REQ-CXC-07), que deriva el dominio.
   *
   * Mismo predicado de "plata efectivamente movida" que la cartera: solo
   * cobros cuyo comprobante (`origenTipo = 'COBRO'`) está en
   * `ESTADOS_CONCILIABLES` y no anulado — un cobro en BORRADOR no movió
   * plata y uno anulado dejó de moverla (§4.7): ninguno otorga saldo a favor.
   *
   * Orden determinístico `fechaContable ASC, createdAt ASC, id ASC` (mismo
   * criterio que la cartera: el mismo conjunto siempre sale igual).
   */
  abstract listarCobrosDeContacto(
    tenantId: string,
    contactoId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<CobroCarteraRow[]>;
}
