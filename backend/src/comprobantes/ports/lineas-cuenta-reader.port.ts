/**
 * Puerto de lectura cross-módulo de LÍNEAS de comprobante acotadas a UNA
 * cuenta del plan (design `conciliacion-bancaria` §3).
 *
 * Vive en `comprobantes/` porque el módulo dueño del dominio es quien define
 * qué puede leerse de él (CLAUDE.md §3.7) — `conciliacion-bancaria` lo
 * consume, no lo posee. Se registra en el módulo-puerto leaf
 * `lineas-cuenta-reader.module.ts` (molde `periodos-reader.module.ts`) para
 * que el consumidor lo importe sin tirar del require de
 * `comprobantes.module.ts` (ciclo de carga CJS).
 *
 * Superficie MÍNIMA: dos métodos. No hay `contar`, no hay `incluirAnulados`
 * en el listado por rango, no hay filtro por comprobante — nada de eso lo
 * necesita el workspace de conciliación.
 */

import type { EstadoComprobante, Moneda, Prisma } from '@prisma/client';

export const LINEAS_CUENTA_READER_PORT = Symbol('LINEAS_CUENTA_READER_PORT');

/**
 * Proyección de una línea contable en MONEDA ORIGINAL. NO es la entidad
 * Prisma: es el shape exacto que consume el workspace de conciliación.
 */
export interface LineaCuentaRow {
  comprobanteId: string;
  orden: number;
  cuentaId: string;
  /** `@db.Date` — calendario puro (§4.6). Se convierte con `FechaContable.fromDbDate` en el boundary. */
  fechaContable: Date;
  moneda: Moneda;
  /** Moneda original — `LibroMayorReaderPort` solo trae los equivalentes en BOB. */
  debito: Prisma.Decimal;
  credito: Prisma.Decimal;
  /** Equivalente en BOB: para MOSTRAR, nunca para matchear (design §3). */
  debitoBob: Prisma.Decimal;
  creditoBob: Prisma.Decimal;
  /** Glosa de la CABECERA del comprobante. */
  glosa: string;
  glosaLinea: string | null;
  numeroComprobante: string | null;
  estado: EstadoComprobante;
  anulado: boolean;
}

export interface LineasCuentaFiltros {
  cuentaId: string;
  /** Inclusive. */
  fechaDesde: Date;
  /** Inclusive. */
  fechaHasta: Date;
}

/** Ancla `(comprobanteId, orden)` de un `MatchConciliacion` (design §2.1). */
export interface AnclaLinea {
  comprobanteId: string;
  orden: number;
}

export abstract class LineasCuentaReaderPort {
  /**
   * Líneas de UNA cuenta del plan en un rango de `fechaContable`, en moneda original.
   *
   * Solo `CONTABILIZADO`/`BLOQUEADO` y `anulado = false`: un BORRADOR no movió
   * plata y un anulado dejó de moverla (§4.7 core) — ninguno de los dos es
   * conciliable.
   *
   * Orden determinístico: `fechaContable ASC, numero ASC NULLS LAST,
   * comprobanteId ASC, orden ASC` — el mismo conjunto siempre sale igual.
   *
   * Multi-tenant: filtra `organizationId` en la línea Y en el comprobante
   * (defense in depth, §4.2 core / Anti-31).
   */
  abstract listarPorCuentaEnRango(
    tenantId: string,
    filtros: LineasCuentaFiltros,
  ): Promise<LineaCuentaRow[]>;

  /**
   * Resuelve anclas `(comprobanteId, orden)` puntuales. NO filtra por
   * `anulado` ni por `estado`: existe para DIAGNOSTICAR por qué se rompió un
   * vínculo (design §2.2) — distinguir "la línea no existe" de "el
   * comprobante fue anulado" exige poder VER la línea anulada.
   *
   * Se invoca solo cuando quedaron anclas huérfanas tras cruzar contra el
   * listado del rango (típicamente ninguna). Devuelve las que existan; las
   * que no resuelvan simplemente no vienen.
   *
   * Multi-tenant: filtra `organizationId` (§4.2 core / Anti-31).
   */
  abstract listarPorAnclas(
    tenantId: string,
    anclas: ReadonlyArray<AnclaLinea>,
  ): Promise<LineaCuentaRow[]>;
}
