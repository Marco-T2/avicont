// Read-surface PROPIA de `ventas` para resolver los datos que se congelan como
// snapshot al crear la venta (D-28, REQ-VTA-02):
//
//   - `Item.cuentaIngresoId` → snapshot `LineaVenta.cuentaIngresoId`.
//     `ItemsReaderPort` expone SOLO `{id, activo}` y REQ-ITM-04 le prohíbe
//     crecer (con escenario dedicado: "la superficie no crece por
//     conveniencia"). La resolución sancionada por este mismo change es la
//     proyección Prisma propia sobre la tabla de ítems — el patrón de la Fase 3
//     (el repositorio de `cuentas` lee `items` para responder
//     `CUENTA_REFERENCIADA_POR_ITEMS`) y el de `cierre-ejercicio` y `reportes`
//     (§3.7: cada módulo define su read-surface).
//
//   - `Contacto.razonSocial` → la glosa del comprobante (Q-2) debe identificar
//     al CLIENTE sin abrir la venta, y `ContactosReaderPort` expone solo
//     `{id, activo}`. La glosa persiste el nombre al momento de vender: es un
//     snapshot más, por eso vive en este mismo port.
//
// SOLO lectura, acotada al tenant (§4.2). La validación de existencia/activo
// sigue siendo de `ItemsReaderPort`/`ContactosReaderPort` — las dos superficies
// conviven.

import type { Prisma } from '@prisma/client';

export const VENTA_SNAPSHOTS_READER_PORT = Symbol('VENTA_SNAPSHOTS_READER_PORT');

export abstract class VentaSnapshotsReaderPort {
  /**
   * `cuentaIngresoId` de un lote de ítems, indexado por `itemId`. El valor es
   * `null` cuando el ítem no tiene cuenta propia (cae al concepto `ventasId`,
   * REQ-VTA-02). Los ids inexistentes o de otro tenant NO aparecen en el Map
   * (§4.2 / REQ-VTA-08).
   */
  abstract obtenerCuentasIngresoDeItems(
    tenantId: string,
    itemIds: string[],
    tx?: Prisma.TransactionClient,
  ): Promise<Map<string, string | null>>;

  /**
   * Razón social del contacto para componer la glosa del comprobante (Q-2).
   * `null` si no existe o pertenece a otro tenant — el caller ya validó la
   * existencia vía `ContactosReaderPort`, así que un `null` acá es defensivo.
   */
  abstract obtenerRazonSocialContacto(
    tenantId: string,
    contactoId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<string | null>;
}
