// Port DEFINIDO y POSEÍDO por `ventas` (§3.7 CLAUDE.md). Resuelve los dos
// conceptos de `OrgConfiguracionContable` que el flujo comercial necesita:
// `cuentasPorCobrarId` (contrapartida del débito en la venta a crédito,
// REQ-VTA-04) y `ventasId` (cuenta de ingreso por defecto cuando el ítem no
// trae la suya, REQ-VTA-02).
//
// Molde: `cierre-ejercicio/ports/cierre-config-reader.port.ts`. Igual que ahí,
// el adapter lee su PROPIA superficie Prisma (§3.7: cada módulo define su
// read-surface) — `ConfiguracionContableRepositoryPort` es interno a su módulo
// y su contrato ni lista estos dos campos.
//
// A diferencia del port del cierre, este NO lanza cuando falta un concepto:
// devuelve `null` y decide el SERVICE, porque acá la exigencia depende de la
// operación — una venta CONTADO no necesita `cuentasPorCobrarId`, y `ventasId`
// solo hace falta si alguna línea trae un ítem sin cuenta propia. El error con
// nombre (`VENTA_CONCEPTO_NO_CONFIGURADO`, REQ-VTA-10/B-12) lo emite el
// service nombrando el concepto que la operación concreta necesitaba.

import type { Prisma } from '@prisma/client';

export const VENTAS_CONFIG_READER_PORT = Symbol('VENTAS_CONFIG_READER_PORT');

export interface VentasConfig {
  /** Cuentas por Cobrar Comerciales (1.1.2.001) o `null` si no está mapeada. */
  cuentasPorCobrarId: string | null;
  /** Ventas (4.1.1.001) o `null` si no está mapeada. */
  ventasId: string | null;
}

export abstract class VentasConfigReaderPort {
  /**
   * Devuelve los conceptos comerciales del tenant. Una org sin fila de
   * configuración devuelve ambos en `null` — nunca lanza.
   * `organizationId` SIEMPRE primer predicado (§4.2 Anti-31).
   *
   * Acepta `tx` para que la lectura participe de la misma transacción que
   * escribe la venta y su comprobante.
   */
  abstract obtenerConfig(tenantId: string, tx?: Prisma.TransactionClient): Promise<VentasConfig>;
}
