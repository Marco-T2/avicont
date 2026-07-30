// Port DEFINIDO y POSEÍDO por `cuentas-por-cobrar` (§3.7 CLAUDE.md). Resuelve
// el concepto de `OrgConfiguracionContable` que el cobro necesita:
// `cuentasPorCobrarId` (el Haber fijo del asiento del cobro, REQ-CXC-02).
//
// NO se importa `VentasConfigReaderPort` de `ventas/ports/` aunque exponga el
// mismo campo: §3.3 prohíbe que un módulo importe de otro módulo. Cada módulo
// define su propia read-surface — molde: `ventas/ports/ventas-config-reader.port.ts`,
// que a su vez clona `cierre-ejercicio/ports/cierre-config-reader.port.ts`.
//
// Igual que allá, este port NO lanza cuando falta el concepto: devuelve `null`
// y decide el SERVICE, que es quien sabe qué operación lo exigía. El error con
// nombre (`COBRO_CONCEPTO_NO_CONFIGURADO`, B-12) lo emite el service.

import type { Prisma } from '@prisma/client';

export const COBROS_CONFIG_READER_PORT = Symbol('COBROS_CONFIG_READER_PORT');

export interface CobrosConfig {
  /** Cuentas por Cobrar Comerciales (1.1.2.001) o `null` si no está mapeada. */
  cuentasPorCobrarId: string | null;
}

export abstract class CobrosConfigReaderPort {
  /**
   * Devuelve el concepto CxC del tenant. Una org sin fila de configuración
   * devuelve `null` — nunca lanza. `organizationId` SIEMPRE primer predicado
   * (§4.2 Anti-31).
   *
   * Acepta `tx` para que la lectura participe de la misma transacción que
   * escribe el cobro y su comprobante.
   */
  abstract obtenerConfig(tenantId: string, tx?: Prisma.TransactionClient): Promise<CobrosConfig>;
}
