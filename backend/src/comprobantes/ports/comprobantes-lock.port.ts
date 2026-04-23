import type { Prisma } from '@prisma/client';

/**
 * Superficie cross-módulo que el módulo `comprobantes` (Fase 1.3) expone a
 * `periodos-fiscales` para los flujos de cierre/reapertura.
 *
 * Define el contrato acá (Fase 1.2) para poder codear periodos-fiscales ya.
 * El adapter `Noop` cumple el contrato devolviendo vacío mientras no exista
 * el módulo `comprobantes`; cuando aparezca en Fase 1.3 se reemplaza el
 * binding por `PrismaComprobantesLockAdapter` sin tocar periodos-fiscales.
 *
 * Recibe la `tx` de Prisma como primer argumento — todas las operaciones
 * deben participar de la misma transacción que el cambio de estado del
 * período para garantizar atomicidad.
 */
export abstract class ComprobantesLockPort {
  /**
   * Transiciona todos los comprobantes `CONTABILIZADO` del período a
   * `BLOQUEADO`. Devuelve la cantidad afectada.
   */
  abstract bloquearPorPeriodo(
    tx: Prisma.TransactionClient,
    periodoId: string,
  ): Promise<number>;

  /**
   * Transiciona todos los comprobantes `BLOQUEADO` del período a
   * `CONTABILIZADO`. Devuelve la cantidad afectada.
   */
  abstract desbloquearPorPeriodo(
    tx: Prisma.TransactionClient,
    periodoId: string,
  ): Promise<number>;

  /**
   * Cuenta comprobantes en estado `BORRADOR` del período. Se usa para
   * bloquear el cierre si hay borradores pendientes.
   */
  abstract contarBorradoresEnPeriodo(
    tx: Prisma.TransactionClient,
    periodoId: string,
  ): Promise<number>;

  /**
   * Devuelve el resumen pre-cierre consultado por el endpoint
   * `GET /periodos/:id/resumen-precierre`.
   */
  abstract obtenerResumenEnPeriodo(
    tx: Prisma.TransactionClient,
    periodoId: string,
  ): Promise<ResumenPeriodo>;
}

export interface ResumenPeriodo {
  contabilizados: number;
  borradores: number;
  anulados: number;
  totalDebeBob: string;
  totalHaberBob: string;
  borradoresList: ResumenBorrador[];
}

export interface ResumenBorrador {
  id: string;
  fechaContable: string;
  glosa: string;
  totalBob: string;
}

export const COMPROBANTES_LOCK_PORT = Symbol('COMPROBANTES_LOCK_PORT');
