/**
 * Adapter Prisma de MovimientoRepositoryPort.
 *
 * CLAUDE.md §4.2 — defense in depth: TODA query filtra por organizationId.
 * Una query sin este filtro es bug de seguridad.
 *
 * Notas de implementación:
 * - sumCantidadByLote usa aggregate._sum (requiere TX obligatorio — G-8)
 * - organizationId se denormaliza en la inserción (espejo de LineaComprobante)
 * - No hay FOR UPDATE aquí; el lock vive en PrismaLoteRepository.findByIdForUpdate
 */

import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import { PrismaService } from '@/common/prisma.service';

import {
  MovimientoCantidadCreateData,
  MovimientoCantidadRow,
  MovimientoInversionCreateData,
  MovimientoInversionRow,
  MovimientoRepositoryPort,
} from '../ports/movimiento.repository.port';

@Injectable()
export class PrismaMovimientoRepository extends MovimientoRepositoryPort {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  // ============================================================
  // Inversión
  // ============================================================

  async createInversion(
    organizationId: string,
    data: MovimientoInversionCreateData,
    tx?: Prisma.TransactionClient,
  ): Promise<MovimientoInversionRow> {
    const client = tx ?? this.prisma;
    const row = await client.movimientoInversion.create({
      data: {
        organizationId,
        loteId: data.loteId,
        tipoRegistroId: data.tipoRegistroId,
        monto: data.monto,
        detalle: data.detalle,
        fecha: data.fecha,
      },
    });
    return this.toInversionRow(row);
  }

  async findInversionById(
    organizationId: string,
    id: string,
    tx?: Prisma.TransactionClient,
  ): Promise<MovimientoInversionRow | null> {
    const client = tx ?? this.prisma;
    const row = await client.movimientoInversion.findFirst({
      where: { id, organizationId },
    });
    return row ? this.toInversionRow(row) : null;
  }

  async listarInversiones(
    organizationId: string,
    loteId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<MovimientoInversionRow[]> {
    const client = tx ?? this.prisma;
    const rows = await client.movimientoInversion.findMany({
      where: { organizationId, loteId },
      orderBy: { fecha: 'desc' },
    });
    return rows.map((r) => this.toInversionRow(r));
  }

  async eliminarInversion(
    organizationId: string,
    id: string,
    tx?: Prisma.TransactionClient,
  ): Promise<number> {
    const client = tx ?? this.prisma;
    const result = await client.movimientoInversion.deleteMany({
      where: { id, organizationId },
    });
    return result.count;
  }

  // ============================================================
  // Cantidad (mortalidad)
  // ============================================================

  async createCantidad(
    organizationId: string,
    data: MovimientoCantidadCreateData,
    tx?: Prisma.TransactionClient,
  ): Promise<MovimientoCantidadRow> {
    const client = tx ?? this.prisma;
    const row = await client.movimientoCantidad.create({
      data: {
        organizationId,
        loteId: data.loteId,
        tipoRegistroId: data.tipoRegistroId,
        cantidad: data.cantidad,
        detalle: data.detalle,
        fecha: data.fecha,
      },
    });
    return this.toCantidadRow(row);
  }

  async findCantidadById(
    organizationId: string,
    id: string,
    tx?: Prisma.TransactionClient,
  ): Promise<MovimientoCantidadRow | null> {
    const client = tx ?? this.prisma;
    const row = await client.movimientoCantidad.findFirst({
      where: { id, organizationId },
    });
    return row ? this.toCantidadRow(row) : null;
  }

  async listarCantidades(
    organizationId: string,
    loteId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<MovimientoCantidadRow[]> {
    const client = tx ?? this.prisma;
    const rows = await client.movimientoCantidad.findMany({
      where: { organizationId, loteId },
      orderBy: { fecha: 'desc' },
    });
    return rows.map((r) => this.toCantidadRow(r));
  }

  async eliminarCantidad(
    organizationId: string,
    id: string,
    tx?: Prisma.TransactionClient,
  ): Promise<number> {
    const client = tx ?? this.prisma;
    const result = await client.movimientoCantidad.deleteMany({
      where: { id, organizationId },
    });
    return result.count;
  }

  /**
   * Suma total de cantidad (mortalidad) para un lote dentro de una TX.
   * Usado por MovimientoService.registrarCantidad() para calcular avesVivas
   * DESPUÉS del SELECT FOR UPDATE sobre el lote (serialización concurrente).
   *
   * tx es OBLIGATORIO para participar del lock del aggregate root.
   */
  async sumCantidadByLote(
    organizationId: string,
    loteId: string,
    tx: Prisma.TransactionClient,
  ): Promise<number> {
    const result = await tx.movimientoCantidad.aggregate({
      where: { organizationId, loteId },
      _sum: { cantidad: true },
    });
    return result._sum.cantidad ?? 0;
  }

  // ============================================================
  // Mapeo Prisma → rows
  // ============================================================

  private toInversionRow(row: {
    id: string;
    organizationId: string;
    loteId: string;
    tipoRegistroId: string;
    monto: Prisma.Decimal;
    detalle: string | null;
    fecha: Date;
    createdAt: Date;
  }): MovimientoInversionRow {
    return {
      id: row.id,
      organizationId: row.organizationId,
      loteId: row.loteId,
      tipoRegistroId: row.tipoRegistroId,
      monto: row.monto,
      detalle: row.detalle,
      fecha: row.fecha,
      createdAt: row.createdAt,
    };
  }

  private toCantidadRow(row: {
    id: string;
    organizationId: string;
    loteId: string;
    tipoRegistroId: string;
    cantidad: number;
    detalle: string | null;
    fecha: Date;
    createdAt: Date;
  }): MovimientoCantidadRow {
    return {
      id: row.id,
      organizationId: row.organizationId,
      loteId: row.loteId,
      tipoRegistroId: row.tipoRegistroId,
      cantidad: row.cantidad,
      detalle: row.detalle,
      fecha: row.fecha,
      createdAt: row.createdAt,
    };
  }
}
