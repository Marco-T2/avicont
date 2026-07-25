// Puerto del repositorio de `MovimientoBancario` (REQ-CB-05/07/13). Multi-tenancy
// defense in depth (CLAUDE.md §4.2): toda query filtra por tenantId.

import type {
  EstadoMovimientoBancario,
  LadoBancario,
  Moneda,
  MovimientoBancario,
  Prisma,
} from '@prisma/client';

export const MOVIMIENTO_BANCARIO_REPOSITORY_PORT = Symbol('MOVIMIENTO_BANCARIO_REPOSITORY_PORT');

export interface MovimientoBancarioCreateData {
  fecha: Date;
  hora: string | null;
  monto: Prisma.Decimal;
  tipo: LadoBancario;
  moneda: Moneda;
  descripcion: string;
  descripcionNormalizada: string;
  referencia: string | null;
  saldo: Prisma.Decimal | null;
  contraparteNombre: string | null;
  contraparteDocumento: string | null;
  datosOriginales: Prisma.InputJsonValue;
  ordinalDia: number;
  /**
   * Índice 0-based dentro del orden CRONOLÓGICO del archivo (REQ-CB-21).
   * `null` cuando la secuencia física no es monótona — no se adivina.
   */
  ordenFisico: number | null;
  hashDedup: string;
}

/**
 * Filtros del listado cross-cuenta del verificador (REQ-VMB-01/03). Llegan
 * YA normalizados por el service: `glosaNormalizada` pasó por
 * `normalizarDescripcion` (D4) y los montos ya son `Prisma.Decimal`.
 */
export interface FiltrosListadoMovimientos {
  /** Inclusive. */
  fechaDesde: Date;
  /** Inclusive. */
  fechaHasta: Date;
  cuentaBancariaId?: string;
  /**
   * Filtra por la columna CACHEADA `estado` (proyección, design §2.3) — la
   * auditoría de REQ-VMB-07 existe justamente porque esta columna puede
   * mentir ante un vínculo roto.
   */
  estado?: EstadoMovimientoBancario;
  montoDesde?: Prisma.Decimal;
  montoHasta?: Prisma.Decimal;
  /** Substring contra `descripcionNormalizada` — ambos lados normalizados (D4). */
  glosaNormalizada?: string;
}

export interface TotalMonedaRow {
  moneda: Moneda;
  tipo: LadoBancario;
  total: Prisma.Decimal;
  cantidad: number;
}

export interface SaldoVigenteRow {
  cuentaBancariaId: string;
  /** `@db.Date` — calendario puro (§4.6). */
  fecha: Date;
  /** `null` honesto si el último movimiento no publica saldo (REQ-VMB-09). */
  saldo: Prisma.Decimal | null;
}

export abstract class MovimientoBancarioRepositoryPort {
  /**
   * Inserta el lote en bloque con `skipDuplicates` sobre
   * `@@unique([cuentaBancariaId, hashDedup])` — la idempotencia de REQ-CB-05/07
   * es ESTRUCTURAL, no una comparación previa en el service (design §6.1).
   * Devuelve la cantidad REALMENTE insertada (`nuevos`); `duplicados =
   * movimientos.length - insertados` lo calcula el caller.
   */
  abstract crearMuchos(
    tenantId: string,
    cuentaBancariaId: string,
    importacionId: string,
    movimientos: readonly MovimientoBancarioCreateData[],
    tx?: Prisma.TransactionClient,
  ): Promise<{ insertados: number }>;

  /** REQ-CB-13: cuenta movimientos de una cuenta bancaria, acotado al tenant activo. */
  abstract contarPorCuentaBancaria(
    tenantId: string,
    cuentaBancariaId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<number>;

  /**
   * Panel `A` del workspace (design §10): movimientos de la cuenta bancaria
   * dentro del rango de fechas, con el orden de PRESENTACIÓN de REQ-CB-21/22:
   * `fecha ASC, hora ASC NULLS LAST, ordenFisico ASC NULLS LAST, id ASC`
   * (total y determinístico). REQ-CB-13: acotado al tenant activo.
   */
  abstract listarPorCuentaBancariaEnRango(
    tenantId: string,
    cuentaBancariaId: string,
    rango: { fechaDesde: Date; fechaHasta: Date },
    tx?: Prisma.TransactionClient,
  ): Promise<MovimientoBancario[]>;

  /** REQ-CB-13: null si no existe o pertenece a otro tenant. */
  abstract findById(
    tenantId: string,
    id: string,
    tx?: Prisma.TransactionClient,
  ): Promise<MovimientoBancario | null>;

  /**
   * Actualiza la columna `estado` — proyección cacheada mantenida SOLO por
   * los caminos de escritura (crear match → `CONCILIADO`, borrar match →
   * `PENDIENTE`, ignorar/des-ignorar). Una LECTURA nunca la toca (design §2.3).
   */
  abstract actualizarEstado(
    tenantId: string,
    id: string,
    estado: EstadoMovimientoBancario,
    tx?: Prisma.TransactionClient,
  ): Promise<MovimientoBancario>;

  /**
   * Página del listado cross-cuenta del verificador (REQ-VMB-01/04/05).
   * Orden de PRESENTACIÓN total y determinístico: `fecha ASC, hora ASC NULLS
   * LAST, ordenFisico ASC NULLS LAST, id ASC` — el `id` final es obligatorio
   * para que la paginación offset no duplique ni pierda filas ante empates.
   * REQ-VMB-13: acotado al tenant activo.
   */
  abstract listarCrossCuenta(
    tenantId: string,
    filtros: FiltrosListadoMovimientos,
    paginacion: { skip: number; take: number },
  ): Promise<MovimientoBancario[]>;

  /** Total de movimientos que satisfacen los MISMOS filtros del listado (REQ-VMB-04). */
  abstract contarCrossCuenta(tenantId: string, filtros: FiltrosListadoMovimientos): Promise<number>;

  /**
   * Totales agrupados por (moneda, tipo) sobre los mismos filtros del listado
   * (REQ-VMB-11). SIN conversión a BOB: los movimientos bancarios no tienen
   * `montoBob` y mezclar monedas sería inventar un tipo de cambio.
   */
  abstract totalesPorMoneda(
    tenantId: string,
    filtros: FiltrosListadoMovimientos,
  ): Promise<TotalMonedaRow[]>;

  /**
   * Ids de los movimientos CON `MatchConciliacion` que satisfacen los filtros
   * — SIN el de `estado`, a propósito: alimenta la auditoría de vínculos de
   * REQ-VMB-07, que debe mirar también lo que el filtro de estado esconde.
   */
  abstract listarIdsConMatch(
    tenantId: string,
    filtros: Omit<FiltrosListadoMovimientos, 'estado'>,
  ): Promise<{ id: string }[]>;

  /**
   * Movimientos puntuales por id, acotados al tenant (Anti-31). Existe para
   * hidratar la franja de vínculos rotos de REQ-VMB-07 — el caller la capa a
   * 100 filas, así que la lista viene ACOTADA (no es un listado general).
   * Orden de presentación (REQ-VMB-05) para display estable.
   */
  abstract listarPorIds(tenantId: string, ids: readonly string[]): Promise<MovimientoBancario[]>;

  /**
   * Último movimiento importado por cuenta bancaria con `fecha <= corte`
   * (REQ-VMB-08), elegido con la inversión EXACTA del orden de presentación:
   * `fecha DESC, hora DESC NULLS FIRST, ordenFisico DESC NULLS FIRST, id
   * DESC` (D3) — la misma fila que cierra el listado. `saldo` sin fallback:
   * si el último movimiento no lo publica, viene `null` (REQ-VMB-09). Una
   * cuenta sin movimientos hasta el corte NO produce fila — el merge null/null
   * con el catálogo de cuentas lo hace el service.
   */
  abstract saldosVigentes(tenantId: string, corte: Date): Promise<SaldoVigenteRow[]>;
}
