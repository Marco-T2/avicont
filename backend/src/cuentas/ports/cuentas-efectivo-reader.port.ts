// Port DEFINIDO por `cuentas` (dueño del dominio Cuenta, §3.7) para que el
// flujo comercial pregunte si una cuenta puede recibir plata.
//
// Consumidores: `ventas` (venta CONTADO, REQ-VTA-04) y `cuentas-por-cobrar`
// (Cobro, REQ-CXC-02). Ninguno de los dos puede evaluar el criterio por su
// cuenta: se definiría dos veces (Anti-01) y sobre plata.
//
// Superficie MÍNIMA a propósito — un booleano, no la cuenta. El consumidor no
// necesita saber POR QUÉ es elegible; sólo si puede debitar ahí. Mismo criterio
// de blast radius que `ContactosReaderPort`, que expone dos campos.
import type { Prisma } from '@prisma/client';

export const CUENTAS_EFECTIVO_READER_PORT = Symbol('CUENTAS_EFECTIVO_READER_PORT');

export abstract class CuentasEfectivoReaderPort {
  /**
   * ¿La cuenta es un destino válido para un cobro o una venta al contado?
   *
   * Criterio en `cuentas/domain/elegibilidad-efectivo.ts` (REQ-CXC-02):
   * `activa ∧ esDetalle ∧ (actividadFlujo = 'EFECTIVO' ∨ código bajo 1.1.1)`.
   * Unión POR CUENTA — **no** es la regla del Estado de Flujo de Efectivo, que
   * usa un interruptor de organización. La divergencia es deliberada.
   *
   * Devuelve `false` —nunca lanza— si la cuenta no existe o pertenece a otro
   * tenant: para el consumidor son el mismo caso ("no podés debitar ahí"), y
   * distinguirlos filtraría la existencia de recursos ajenos (§4.2).
   *
   * Acepta `tx` para que la validación participe de la misma transacción que
   * escribe el comprobante, igual que `CuentasReaderPort.obtenerBatch`.
   */
  abstract esElegibleComoDestino(
    tenantId: string,
    cuentaId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<boolean>;
}
