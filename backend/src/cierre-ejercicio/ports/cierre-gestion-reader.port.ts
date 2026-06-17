// Port DEFINIDO y POSEÍDO por `cierre-ejercicio` (§3.7 CLAUDE.md). Lee TODO lo
// que el servicio necesita de la gestión para orquestar el cierre en una sola
// query: estado, rango de fechas, el período del mesCierre, los conteos para el
// gate de períodos (REQ-CE-10) y los comprobantes de cierre ya existentes (para
// la idempotencia REQ-CE-09).

import type { EstadoComprobante, GestionFiscalStatus } from '@prisma/client';

export const CIERRE_GESTION_READER_PORT = Symbol('CIERRE_GESTION_READER_PORT');

/** Comprobante de cierre ya persistido para una gestión (idempotencia REQ-CE-09). */
export interface CierreComprobanteExistente {
  id: string;
  origenTipo: string;
  estado: EstadoComprobante;
}

export interface GestionParaCierre {
  id: string;
  year: number;
  status: GestionFiscalStatus;
  /** Total de períodos de la gestión (normalmente 12). */
  periodosCount: number;
  /** Períodos en estado CERRADO (para el gate REQ-CE-10). */
  periodosCerradosCount: number;
  /** El período del mesCierre (`ordenEnGestion` máximo): donde se fechan los cierres. */
  periodoMesCierre: {
    id: string;
    year: number;
    month: number;
    estaAbierto: boolean;
    /**
     * Fecha contable de los 3 comprobantes de cierre: último día calendario del
     * mesCierre (`@db.Date`, sin hora). REQ-CE-07 (Ley 843 art. 46). El adapter
     * la deriva de year/month para mantener la aritmética de fechas en infra
     * (§4.6: `new Date()` prohibido en service/domain).
     */
    fechaCierre: Date;
  };
  /**
   * Rango calendario [desde, hasta] de la gestión completa, derivado del primer
   * y último período. Se usa para leer los saldos de resultado del ejercicio.
   * `desde` = primer día del primer mes; `hasta` = último día del mesCierre.
   */
  rangoGestion: { desde: Date; hasta: Date };
  /** Comprobantes de cierre ya generados para esta gestión (≤3). */
  comprobantesDeCierre: CierreComprobanteExistente[];
}

export abstract class CierreGestionReaderPort {
  /**
   * Devuelve la gestión y todo su contexto de cierre. Retorna `null` si la
   * gestión no existe o es de otro tenant (defense in depth §4.2: no distingue —
   * el service lo traduce a `CierreGestionNoEncontradaError` 404).
   * organizationId SIEMPRE primer predicado (§4.2 Anti-31).
   */
  abstract obtenerParaCierre(
    gestionId: string,
    tenantId: string,
  ): Promise<GestionParaCierre | null>;
}
