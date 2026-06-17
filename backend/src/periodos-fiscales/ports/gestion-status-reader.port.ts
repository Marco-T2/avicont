// Port DEFINIDO por periodos-fiscales (dueño del dominio GestionFiscal, §3.7
// CLAUDE.md) para lectura cross-módulo del estado de la gestión.
//
// Consumidor: `comprobantes` lo usa para bloquear la anulación de un comprobante
// de CIERRE (`generadoPorSistema=true`) cuando su gestión ya está CERRADA
// (REQ-CMP-SYS-06). Sin reabrir el período no se toca un cierre de gestión
// cerrada (§4.4 — sin bypass de admin).
//
// Superficie MÍNIMA: una sola consulta de "¿está cerrada la gestión a la que
// pertenece este período?". Se recibe el `periodoFiscalId` (el comprobante ya lo
// tiene) y el adapter navega periodoFiscal → gestion → status. No expone
// métodos de escritura ni el resto del agregado GestionFiscal.

export const GESTION_STATUS_READER_PORT = Symbol('GESTION_STATUS_READER_PORT');

export abstract class GestionStatusReaderPort {
  /**
   * Devuelve `true` si la gestión fiscal a la que pertenece el período indicado
   * está `CERRADA`. Scoped al tenant (defense in depth §4.2): un periodoFiscalId
   * de otro tenant nunca revela el estado de una gestión ajena.
   *
   * Retorna `false` si el período no existe / no es del tenant — el caller trata
   * la ausencia como "no cerrada" (el resto de validaciones del flujo de
   * anulación ya cubren el caso de período inexistente).
   */
  abstract estaGestionCerradaPorPeriodo(
    periodoFiscalId: string,
    tenantId: string,
  ): Promise<boolean>;
}
