import { Injectable } from '@nestjs/common';
import type { EstadoMovimientoBancario, MovimientoBancario } from '@prisma/client';
import { Prisma } from '@prisma/client';

import { PrismaService } from '@/common/prisma.service';

import { MovimientoBancarioNoEncontradoError } from '../domain/conciliacion-errors';
import {
  FiltrosListadoMovimientos,
  MovimientoBancarioCreateData,
  MovimientoBancarioRepositoryPort,
  SaldoVigenteRow,
  TotalMonedaRow,
} from '../ports/movimiento-bancario.repository.port';

/**
 * Orden de PRESENTACIÓN (REQ-CB-21/22, REQ-VMB-05): la hora manda,
 * `ordenFisico` desempata dentro del día y el `id` cierra para que el orden
 * sea TOTAL — sin él la paginación offset duplica o pierde filas.
 */
const ORDEN_PRESENTACION = [
  { fecha: 'asc' },
  { hora: { sort: 'asc', nulls: 'last' } },
  { ordenFisico: { sort: 'asc', nulls: 'last' } },
  { id: 'asc' },
] satisfies Prisma.MovimientoBancarioOrderByWithRelationInput[];

@Injectable()
export class PrismaMovimientoBancarioRepository extends MovimientoBancarioRepositoryPort {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async crearMuchos(
    tenantId: string,
    cuentaBancariaId: string,
    importacionId: string,
    movimientos: readonly MovimientoBancarioCreateData[],
    tx?: Prisma.TransactionClient,
  ): Promise<{ insertados: number }> {
    if (movimientos.length === 0) return { insertados: 0 };
    const client = tx ?? this.prisma;

    const resultado = await client.movimientoBancario.createMany({
      data: movimientos.map((m) => ({
        organizationId: tenantId,
        cuentaBancariaId,
        importacionId,
        fecha: m.fecha,
        hora: m.hora,
        monto: m.monto,
        tipo: m.tipo,
        moneda: m.moneda,
        descripcion: m.descripcion,
        descripcionNormalizada: m.descripcionNormalizada,
        referencia: m.referencia,
        saldo: m.saldo,
        contraparteNombre: m.contraparteNombre,
        contraparteDocumento: m.contraparteDocumento,
        datosOriginales: m.datosOriginales,
        ordinalDia: m.ordinalDia,
        ordenFisico: m.ordenFisico,
        hashDedup: m.hashDedup,
      })),
      skipDuplicates: true, // @@unique([cuentaBancariaId, hashDedup]) — idempotencia ESTRUCTURAL (design §6.1)
    });

    return { insertados: resultado.count };
  }

  async contarPorCuentaBancaria(
    tenantId: string,
    cuentaBancariaId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<number> {
    const client = tx ?? this.prisma;
    return client.movimientoBancario.count({
      where: { organizationId: tenantId, cuentaBancariaId },
    });
  }

  async listarPorCuentaBancariaEnRango(
    tenantId: string,
    cuentaBancariaId: string,
    rango: { fechaDesde: Date; fechaHasta: Date },
    tx?: Prisma.TransactionClient,
  ): Promise<MovimientoBancario[]> {
    const client = tx ?? this.prisma;
    return client.movimientoBancario.findMany({
      where: {
        organizationId: tenantId,
        cuentaBancariaId,
        fecha: { gte: rango.fechaDesde, lte: rango.fechaHasta },
      },
      orderBy: ORDEN_PRESENTACION,
    });
  }

  async findById(
    tenantId: string,
    id: string,
    tx?: Prisma.TransactionClient,
  ): Promise<MovimientoBancario | null> {
    const client = tx ?? this.prisma;
    return client.movimientoBancario.findFirst({
      where: { id, organizationId: tenantId },
    });
  }

  async actualizarEstado(
    tenantId: string,
    id: string,
    estado: EstadoMovimientoBancario,
    tx?: Prisma.TransactionClient,
  ): Promise<MovimientoBancario> {
    const client = tx ?? this.prisma;
    // updateMany + re-lectura en vez de `update`: `update` exige un unique y
    // dejaría `organizationId` fuera del WHERE (Anti-31).
    const { count } = await client.movimientoBancario.updateMany({
      where: { id, organizationId: tenantId },
      data: { estado },
    });
    if (count === 0) {
      throw new MovimientoBancarioNoEncontradoError(id);
    }
    const actualizado = await client.movimientoBancario.findFirstOrThrow({
      where: { id, organizationId: tenantId },
    });
    return actualizado;
  }

  async listarCrossCuenta(
    tenantId: string,
    filtros: FiltrosListadoMovimientos,
    paginacion: { skip: number; take: number },
  ): Promise<MovimientoBancario[]> {
    return this.prisma.movimientoBancario.findMany({
      where: this.whereListado(tenantId, filtros),
      orderBy: ORDEN_PRESENTACION,
      skip: paginacion.skip,
      take: paginacion.take,
    });
  }

  async contarCrossCuenta(tenantId: string, filtros: FiltrosListadoMovimientos): Promise<number> {
    return this.prisma.movimientoBancario.count({
      where: this.whereListado(tenantId, filtros),
    });
  }

  async totalesPorMoneda(
    tenantId: string,
    filtros: FiltrosListadoMovimientos,
  ): Promise<TotalMonedaRow[]> {
    const grupos = await this.prisma.movimientoBancario.groupBy({
      by: ['moneda', 'tipo'],
      where: this.whereListado(tenantId, filtros),
      _sum: { monto: true },
      _count: { _all: true },
    });
    return grupos.map((g) => ({
      moneda: g.moneda,
      tipo: g.tipo,
      // Un grupo existe solo si tiene filas y `monto` es NOT NULL — el `?? 0`
      // es para el tipo, no un fallback semántico.
      total: g._sum.monto ?? new Prisma.Decimal(0),
      cantidad: g._count._all,
    }));
  }

  async listarIdsConMatch(
    tenantId: string,
    filtros: Omit<FiltrosListadoMovimientos, 'estado'>,
  ): Promise<{ id: string }[]> {
    return this.prisma.movimientoBancario.findMany({
      where: { ...this.whereListado(tenantId, filtros), match: { isNot: null } },
      select: { id: true },
      orderBy: { id: 'asc' },
    });
  }

  async listarPorIds(tenantId: string, ids: readonly string[]): Promise<MovimientoBancario[]> {
    if (ids.length === 0) return [];
    return this.prisma.movimientoBancario.findMany({
      where: { organizationId: tenantId, id: { in: [...ids] } },
      orderBy: ORDEN_PRESENTACION,
    });
  }

  async saldosVigentes(tenantId: string, corte: Date): Promise<SaldoVigenteRow[]> {
    // DISTINCT ON no existe en el query builder (design D2) — primer raw del
    // módulo, contra la tabla PROPIA. La inversión del orden de presentación
    // es DESC NULLS FIRST (D3): elige la misma fila que cierra el listado.
    type RawRow = { cuentaBancariaId: string; fecha: Date; saldo: string | null };
    const rows = await this.prisma.$queryRaw<RawRow[]>(Prisma.sql`
      SELECT DISTINCT ON ("cuentaBancariaId") "cuentaBancariaId", fecha, saldo
      FROM movimientos_bancarios
      WHERE "organizationId" = ${tenantId} AND fecha <= ${corte}
      ORDER BY "cuentaBancariaId", fecha DESC, hora DESC NULLS FIRST,
               "ordenFisico" DESC NULLS FIRST, id DESC
    `);
    return rows.map((row) => ({
      cuentaBancariaId: row.cuentaBancariaId,
      fecha: row.fecha,
      // Postgres devuelve numeric como string en $queryRaw — convertir a
      // Decimal en el boundary (precedente `reportes/`).
      saldo: row.saldo === null ? null : new Prisma.Decimal(row.saldo),
    }));
  }

  /**
   * WHERE compartido por página/count/totales/ids-con-match — un solo builder
   * para que los agregados jamás driften del listado (molde
   * `construirWhereListado` del núcleo contable; Anti-31: `organizationId`
   * SIEMPRE presente).
   */
  private whereListado(
    tenantId: string,
    filtros: Omit<FiltrosListadoMovimientos, 'estado'> & {
      estado?: FiltrosListadoMovimientos['estado'];
    },
  ): Prisma.MovimientoBancarioWhereInput {
    const montoFiltro = {
      ...(filtros.montoDesde !== undefined ? { gte: filtros.montoDesde } : {}),
      ...(filtros.montoHasta !== undefined ? { lte: filtros.montoHasta } : {}),
    };
    return {
      organizationId: tenantId,
      fecha: { gte: filtros.fechaDesde, lte: filtros.fechaHasta },
      ...(filtros.cuentaBancariaId !== undefined
        ? { cuentaBancariaId: filtros.cuentaBancariaId }
        : {}),
      ...(filtros.estado !== undefined ? { estado: filtros.estado } : {}),
      ...(Object.keys(montoFiltro).length > 0 ? { monto: montoFiltro } : {}),
      ...(filtros.glosaNormalizada !== undefined
        ? { descripcionNormalizada: { contains: filtros.glosaNormalizada } }
        : {}),
    };
  }
}
