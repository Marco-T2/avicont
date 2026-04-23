import { Injectable } from '@nestjs/common';

import {
  ComprobantesLockPort,
  ResumenPeriodo,
} from '../ports/comprobantes-lock.port';

/**
 * Stub de Fase 1.2: no hay módulo `comprobantes` todavía, así que este
 * adapter reporta siempre "cero comprobantes, cero borradores". Permite que
 * `periodos-fiscales` se pueda probar end-to-end sin romper el contrato.
 *
 * Se reemplaza por `PrismaComprobantesLockAdapter` en Fase 1.3.
 * Ver docs/disenos/gestiones-periodos-fiscales-v3.md §5.1.1.
 */
@Injectable()
export class NoopComprobantesLockAdapter extends ComprobantesLockPort {
  async bloquearPorPeriodo(): Promise<number> {
    return 0;
  }

  async desbloquearPorPeriodo(): Promise<number> {
    return 0;
  }

  async contarBorradoresEnPeriodo(): Promise<number> {
    return 0;
  }

  async obtenerResumenEnPeriodo(): Promise<ResumenPeriodo> {
    return {
      contabilizados: 0,
      borradores: 0,
      anulados: 0,
      totalDebeBob: '0.00',
      totalHaberBob: '0.00',
      borradoresList: [],
    };
  }
}
