// Puerto unificado para movimientos de inversión y cantidad. Mantener un
// solo port evita dos módulos de repositorio para tablas que comparten
// loteId/organizationId y query patterns similares.
// Multi-tenancy defense in depth (CLAUDE.md §4.2): TODA query filtra por
// organizationId.

import type { Prisma } from '@prisma/client';

export const MOVIMIENTO_REPOSITORY_PORT = Symbol('MOVIMIENTO_REPOSITORY_PORT');

// ============================================================
// Tipos de fila (devueltos por el repo — datos crudos sin VO)
// ============================================================

export interface MovimientoInversionRow {
  id: string;
  organizationId: string;
  loteId: string;
  tipoRegistroId: string;
  monto: Prisma.Decimal;
  detalle: string | null;
  fecha: Date;
  createdAt: Date;
}

export interface MovimientoCantidadRow {
  id: string;
  organizationId: string;
  loteId: string;
  tipoRegistroId: string;
  cantidad: number;
  detalle: string | null;
  fecha: Date;
  createdAt: Date;
}

// ============================================================
// Datos de entrada
// ============================================================

export interface MovimientoInversionCreateData {
  loteId: string;
  tipoRegistroId: string;
  monto: Prisma.Decimal;
  detalle: string | null;
  fecha: Date;
}

export interface MovimientoCantidadCreateData {
  loteId: string;
  tipoRegistroId: string;
  cantidad: number;
  detalle: string | null;
  fecha: Date;
}

// ============================================================
// Port
// ============================================================

export abstract class MovimientoRepositoryPort {
  // ---- Inversión ----

  abstract createInversion(
    organizationId: string,
    data: MovimientoInversionCreateData,
    tx?: Prisma.TransactionClient,
  ): Promise<MovimientoInversionRow>;

  abstract findInversionById(
    organizationId: string,
    id: string,
    tx?: Prisma.TransactionClient,
  ): Promise<MovimientoInversionRow | null>;

  abstract listarInversiones(
    organizationId: string,
    loteId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<MovimientoInversionRow[]>;

  abstract eliminarInversion(
    organizationId: string,
    id: string,
    tx?: Prisma.TransactionClient,
  ): Promise<number>;

  // ---- Cantidad (mortalidad) ----

  abstract createCantidad(
    organizationId: string,
    data: MovimientoCantidadCreateData,
    tx?: Prisma.TransactionClient,
  ): Promise<MovimientoCantidadRow>;

  abstract findCantidadById(
    organizationId: string,
    id: string,
    tx?: Prisma.TransactionClient,
  ): Promise<MovimientoCantidadRow | null>;

  abstract listarCantidades(
    organizationId: string,
    loteId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<MovimientoCantidadRow[]>;

  abstract eliminarCantidad(
    organizationId: string,
    id: string,
    tx?: Prisma.TransactionClient,
  ): Promise<number>;

  /**
   * Suma total de cantidad (mortalidad) para un lote dentro de una
   * transacción. Método estrella para calcular avesVivas bajo FOR UPDATE
   * (S4). tx OBLIGATORIO para participar del lock del lote raíz.
   */
  abstract sumCantidadByLote(
    organizationId: string,
    loteId: string,
    tx: Prisma.TransactionClient,
  ): Promise<number>;
}
