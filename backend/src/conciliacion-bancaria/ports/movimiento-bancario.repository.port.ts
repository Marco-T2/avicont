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
  hashDedup: string;
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
   * dentro del rango de fechas, orden `fecha ASC, ordinalDia ASC, id ASC`
   * (determinístico). REQ-CB-13: acotado al tenant activo.
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
}
