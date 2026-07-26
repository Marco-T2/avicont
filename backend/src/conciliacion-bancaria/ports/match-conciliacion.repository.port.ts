// Puerto del repositorio de `MatchConciliacion` (REQ-CB-10/13/17) — el último
// de los 4 repos del módulo. Multi-tenancy defense in depth (CLAUDE.md §4.2):
// toda query filtra por tenantId.

import type { LadoContable, MatchConciliacion, Moneda, Prisma } from '@prisma/client';

import type { AnclaLinea } from '@/comprobantes/ports/lineas-cuenta-reader.port';

export const MATCH_CONCILIACION_REPOSITORY_PORT = Symbol('MATCH_CONCILIACION_REPOSITORY_PORT');

/**
 * Datos de creación de un match. El snapshot de 5 campos (design §2.1) se
 * toma de la línea contable EN EL MOMENTO de confirmar — cada campo es capaz
 * de invalidar el vínculo por sí solo en las lecturas posteriores.
 */
export interface MatchConciliacionCreateData {
  movimientoBancarioId: string;
  comprobanteId: string;
  orden: number;
  snapshotCuentaId: string;
  snapshotMonto: Prisma.Decimal;
  /** Lado CONTABLE de la línea (NO `LadoBancario` — design §5.1). */
  snapshotTipo: LadoContable;
  snapshotMoneda: Moneda;
  snapshotFecha: Date;
  /** `'ALTA'|'MEDIA'|'BAJA'` cuando viene de una sugerencia; `null` si es manual. */
  confianzaSugerida: string | null;
  conciliadoPorUserId: string;
}

export abstract class MatchConciliacionRepositoryPort {
  /**
   * Crea el match. La unicidad 1↔1 la enforzan las constraints
   * `@@unique([organizationId, movimientoBancarioId])` y
   * `@@unique([organizationId, comprobanteId, orden])` — el service pre-chequea
   * para dar un error amable, la DB es el enforcement duro (CLAUDE.md §4.8).
   */
  abstract crear(
    tenantId: string,
    data: MatchConciliacionCreateData,
    tx?: Prisma.TransactionClient,
  ): Promise<MatchConciliacion>;

  /** REQ-CB-13: null si no existe o pertenece a otro tenant. */
  abstract findById(
    tenantId: string,
    id: string,
    tx?: Prisma.TransactionClient,
  ): Promise<MatchConciliacion | null>;

  /** Match del movimiento, o null. Pega contra `@@unique([organizationId, movimientoBancarioId])`. */
  abstract findByMovimiento(
    tenantId: string,
    movimientoBancarioId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<MatchConciliacion | null>;

  /**
   * Match que reclama el ancla `(comprobanteId, orden)`, o null. Pega contra
   * `@@unique([organizationId, comprobanteId, orden])`. Lo usa `crearMatch`
   * para decidir entre 409 (vínculo sano) y reemplazo (vínculo roto, §2.4).
   */
  abstract findByAncla(
    tenantId: string,
    comprobanteId: string,
    orden: number,
    tx?: Prisma.TransactionClient,
  ): Promise<MatchConciliacion | null>;

  /**
   * Matches de un conjunto de movimientos — el set `M` del workspace
   * (design §10). Una sola query; `[]` si la lista viene vacía.
   */
  abstract listarPorMovimientos(
    tenantId: string,
    movimientoBancarioIds: readonly string[],
    tx?: Prisma.TransactionClient,
  ): Promise<MatchConciliacion[]>;

  /**
   * Matches que reclaman un conjunto de anclas `(comprobanteId, orden)` — una
   * sola query; `[]` si la lista viene vacía. Existe para el INFORME de
   * conciliación (task 3.6): una línea de la ventana puede estar reclamada por
   * un movimiento FUERA de ella (posterior al corte, o absorbido en el
   * arranque) y `listarPorMovimientos` jamás traería ese match — sin él la
   * línea se clasificaría EN_TRANSITO y la identidad mentiría.
   */
  abstract listarPorAnclas(
    tenantId: string,
    anclas: ReadonlyArray<AnclaLinea>,
    tx?: Prisma.TransactionClient,
  ): Promise<MatchConciliacion[]>;

  /** Borra el match por id. No toca el comprobante ni sus líneas (REQ-CB-15). */
  abstract eliminar(tenantId: string, id: string, tx?: Prisma.TransactionClient): Promise<void>;
}
