import { Injectable } from '@nestjs/common';
import { NaturalezaCuenta } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

import { PrismaService } from '@/common/prisma.service';

import type {
  CuentaDetalleResult,
  LibroMayorFiltros,
  MovimientoMayorRow,
  SaldoInicialRow,
} from '../ports/libro-mayor-reader.port';
import { LibroMayorReaderPort } from '../ports/libro-mayor-reader.port';

/**
 * Adapter Prisma para `LibroMayorReaderPort`.
 *
 * Design decisión #2: $queryRaw parametrizado (NO findMany) porque:
 *   - El Mayor filtra LÍNEAS por una fecha que vive en la CABECERA.
 *   - Prisma groupBy NO soporta filtros sobre relaciones (where de groupBy
 *     es solo escalares de la tabla agrupada).
 *   - Traer todo el histórico a memoria sería inviable en produción.
 *
 * Defense in depth (CLAUDE.md §4.2, Anti-31):
 *   `lc."organizationId" = ${tenantId}` SIEMPRE como PRIMER predicado
 *   en AMBAS queries. No confiamos en que el caller ya filtró.
 *
 * Estado FIJO: `c.estado IN ('CONTABILIZADO','BLOQUEADO')` nunca parametrizable.
 * BORRADOR NUNCA incluido (REQ-LM-02).
 */
@Injectable()
export class PrismaLibroMayorReaderAdapter extends LibroMayorReaderPort {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async contarMovimientos(tenantId: string, filtros: LibroMayorFiltros): Promise<number> {
    // Defense in depth (§4.2 Anti-31): organizationId como PRIMER predicado.
    // Estado FIJO: CONTABILIZADO/BLOQUEADO. BORRADOR nunca cuenta (REQ-LM-02).
    const rows = filtros.cuentaId
      ? filtros.incluirAnulados
        ? await this.prisma.$queryRaw<[{ count: bigint }]>`
            SELECT COUNT(*) AS count
            FROM lineas_comprobante lc
            JOIN comprobantes c ON c.id = lc."comprobanteId"
            WHERE lc."organizationId" = ${tenantId}
              AND lc."cuentaId" = ${filtros.cuentaId}
              AND c.estado IN ('CONTABILIZADO','BLOQUEADO')
              AND c."fechaContable" >= ${filtros.fechaDesde}
              AND c."fechaContable" <= ${filtros.fechaHasta}
          `
        : await this.prisma.$queryRaw<[{ count: bigint }]>`
            SELECT COUNT(*) AS count
            FROM lineas_comprobante lc
            JOIN comprobantes c ON c.id = lc."comprobanteId"
            WHERE lc."organizationId" = ${tenantId}
              AND lc."cuentaId" = ${filtros.cuentaId}
              AND c.estado IN ('CONTABILIZADO','BLOQUEADO')
              AND c."fechaContable" >= ${filtros.fechaDesde}
              AND c."fechaContable" <= ${filtros.fechaHasta}
              AND c.anulado = false
          `
      : filtros.incluirAnulados
        ? await this.prisma.$queryRaw<[{ count: bigint }]>`
            SELECT COUNT(*) AS count
            FROM lineas_comprobante lc
            JOIN comprobantes c ON c.id = lc."comprobanteId"
            WHERE lc."organizationId" = ${tenantId}
              AND c.estado IN ('CONTABILIZADO','BLOQUEADO')
              AND c."fechaContable" >= ${filtros.fechaDesde}
              AND c."fechaContable" <= ${filtros.fechaHasta}
          `
        : await this.prisma.$queryRaw<[{ count: bigint }]>`
            SELECT COUNT(*) AS count
            FROM lineas_comprobante lc
            JOIN comprobantes c ON c.id = lc."comprobanteId"
            WHERE lc."organizationId" = ${tenantId}
              AND c.estado IN ('CONTABILIZADO','BLOQUEADO')
              AND c."fechaContable" >= ${filtros.fechaDesde}
              AND c."fechaContable" <= ${filtros.fechaHasta}
              AND c.anulado = false
          `;

    return Number(rows[0]?.count ?? 0);
  }

  async obtenerMovimientos(
    tenantId: string,
    filtros: LibroMayorFiltros,
  ): Promise<MovimientoMayorRow[]> {
    // Defense in depth (§4.2 Anti-31): organizationId como PRIMER predicado.
    // Orden determinístico (REQ-LM-05):
    //   cu.id → c."fechaContable" ASC → c.numero ASC NULLS LAST → c.id ASC → lc.orden ASC
    // Postgres devuelve `numeric` como string en $queryRaw → se construye Decimal en el mapper.

    type RawRow = {
      cuentaId: string;
      codigoInterno: string;
      nombreCuenta: string;
      naturaleza: string;
      comprobanteId: string;
      numeroComprobante: string | null;
      fechaContable: Date;
      glosa: string;
      glosaLinea: string | null;
      estado: string;
      anulado: boolean;
      orden: number;
      debitoBob: string;
      creditoBob: string;
    };

    const rows: RawRow[] = filtros.cuentaId
      ? filtros.incluirAnulados
        ? await this.prisma.$queryRaw`
            SELECT
              cu.id AS "cuentaId",
              cu."codigoInterno",
              cu.nombre AS "nombreCuenta",
              cu.naturaleza,
              c.id AS "comprobanteId",
              c.numero AS "numeroComprobante",
              c."fechaContable",
              c.glosa,
              lc."glosaLinea",
              c.estado,
              c.anulado,
              lc.orden,
              lc."debitoBob",
              lc."creditoBob"
            FROM lineas_comprobante lc
            JOIN comprobantes c ON c.id = lc."comprobanteId"
            JOIN cuentas cu ON cu.id = lc."cuentaId"
            WHERE lc."organizationId" = ${tenantId}
              AND lc."cuentaId" = ${filtros.cuentaId}
              AND c.estado IN ('CONTABILIZADO','BLOQUEADO')
              AND c."fechaContable" >= ${filtros.fechaDesde}
              AND c."fechaContable" <= ${filtros.fechaHasta}
            ORDER BY cu.id, c."fechaContable" ASC, c.numero ASC NULLS LAST, c.id ASC, lc.orden ASC
          `
        : await this.prisma.$queryRaw`
            SELECT
              cu.id AS "cuentaId",
              cu."codigoInterno",
              cu.nombre AS "nombreCuenta",
              cu.naturaleza,
              c.id AS "comprobanteId",
              c.numero AS "numeroComprobante",
              c."fechaContable",
              c.glosa,
              lc."glosaLinea",
              c.estado,
              c.anulado,
              lc.orden,
              lc."debitoBob",
              lc."creditoBob"
            FROM lineas_comprobante lc
            JOIN comprobantes c ON c.id = lc."comprobanteId"
            JOIN cuentas cu ON cu.id = lc."cuentaId"
            WHERE lc."organizationId" = ${tenantId}
              AND lc."cuentaId" = ${filtros.cuentaId}
              AND c.estado IN ('CONTABILIZADO','BLOQUEADO')
              AND c."fechaContable" >= ${filtros.fechaDesde}
              AND c."fechaContable" <= ${filtros.fechaHasta}
              AND c.anulado = false
            ORDER BY cu.id, c."fechaContable" ASC, c.numero ASC NULLS LAST, c.id ASC, lc.orden ASC
          `
      : filtros.incluirAnulados
        ? await this.prisma.$queryRaw`
            SELECT
              cu.id AS "cuentaId",
              cu."codigoInterno",
              cu.nombre AS "nombreCuenta",
              cu.naturaleza,
              c.id AS "comprobanteId",
              c.numero AS "numeroComprobante",
              c."fechaContable",
              c.glosa,
              lc."glosaLinea",
              c.estado,
              c.anulado,
              lc.orden,
              lc."debitoBob",
              lc."creditoBob"
            FROM lineas_comprobante lc
            JOIN comprobantes c ON c.id = lc."comprobanteId"
            JOIN cuentas cu ON cu.id = lc."cuentaId"
            WHERE lc."organizationId" = ${tenantId}
              AND c.estado IN ('CONTABILIZADO','BLOQUEADO')
              AND c."fechaContable" >= ${filtros.fechaDesde}
              AND c."fechaContable" <= ${filtros.fechaHasta}
            ORDER BY cu.id, c."fechaContable" ASC, c.numero ASC NULLS LAST, c.id ASC, lc.orden ASC
          `
        : await this.prisma.$queryRaw`
            SELECT
              cu.id AS "cuentaId",
              cu."codigoInterno",
              cu.nombre AS "nombreCuenta",
              cu.naturaleza,
              c.id AS "comprobanteId",
              c.numero AS "numeroComprobante",
              c."fechaContable",
              c.glosa,
              lc."glosaLinea",
              c.estado,
              c.anulado,
              lc.orden,
              lc."debitoBob",
              lc."creditoBob"
            FROM lineas_comprobante lc
            JOIN comprobantes c ON c.id = lc."comprobanteId"
            JOIN cuentas cu ON cu.id = lc."cuentaId"
            WHERE lc."organizationId" = ${tenantId}
              AND c.estado IN ('CONTABILIZADO','BLOQUEADO')
              AND c."fechaContable" >= ${filtros.fechaDesde}
              AND c."fechaContable" <= ${filtros.fechaHasta}
              AND c.anulado = false
            ORDER BY cu.id, c."fechaContable" ASC, c.numero ASC NULLS LAST, c.id ASC, lc.orden ASC
          `;

    // Postgres retorna `numeric` como string en $queryRaw — construir Decimal
    return rows.map((r) => ({
      ...r,
      naturaleza: r.naturaleza as NaturalezaCuenta,
      debitoBob: new Decimal(r.debitoBob),
      creditoBob: new Decimal(r.creditoBob),
    }));
  }

  async obtenerSaldosIniciales(
    tenantId: string,
    filtros: LibroMayorFiltros,
  ): Promise<SaldoInicialRow[]> {
    // Defense in depth (§4.2 Anti-31): organizationId como PRIMER predicado.
    // Saldo histórico: c."fechaContable" < fechaDesde (strict).
    // COALESCE(SUM(...), 0): evita nulls si la cuenta no tiene filas (Postgres GROUP BY corner case).
    // Postgres retorna `numeric` como string → se construye Decimal en el mapper.

    type RawSaldo = {
      cuentaId: string;
      codigoInterno: string;
      nombreCuenta: string;
      naturaleza: string;
      totalDebitoBob: string;
      totalCreditoBob: string;
    };

    const rows: RawSaldo[] = filtros.cuentaId
      ? filtros.incluirAnulados
        ? await this.prisma.$queryRaw`
            SELECT
              cu.id AS "cuentaId",
              cu."codigoInterno",
              cu.nombre AS "nombreCuenta",
              cu.naturaleza,
              COALESCE(SUM(lc."debitoBob"), 0) AS "totalDebitoBob",
              COALESCE(SUM(lc."creditoBob"), 0) AS "totalCreditoBob"
            FROM lineas_comprobante lc
            JOIN comprobantes c ON c.id = lc."comprobanteId"
            JOIN cuentas cu ON cu.id = lc."cuentaId"
            WHERE lc."organizationId" = ${tenantId}
              AND lc."cuentaId" = ${filtros.cuentaId}
              AND c.estado IN ('CONTABILIZADO','BLOQUEADO')
              AND c."fechaContable" < ${filtros.fechaDesde}
            GROUP BY cu.id, cu."codigoInterno", cu.nombre, cu.naturaleza
          `
        : await this.prisma.$queryRaw`
            SELECT
              cu.id AS "cuentaId",
              cu."codigoInterno",
              cu.nombre AS "nombreCuenta",
              cu.naturaleza,
              COALESCE(SUM(lc."debitoBob"), 0) AS "totalDebitoBob",
              COALESCE(SUM(lc."creditoBob"), 0) AS "totalCreditoBob"
            FROM lineas_comprobante lc
            JOIN comprobantes c ON c.id = lc."comprobanteId"
            JOIN cuentas cu ON cu.id = lc."cuentaId"
            WHERE lc."organizationId" = ${tenantId}
              AND lc."cuentaId" = ${filtros.cuentaId}
              AND c.estado IN ('CONTABILIZADO','BLOQUEADO')
              AND c."fechaContable" < ${filtros.fechaDesde}
              AND c.anulado = false
            GROUP BY cu.id, cu."codigoInterno", cu.nombre, cu.naturaleza
          `
      : filtros.incluirAnulados
        ? await this.prisma.$queryRaw`
            SELECT
              cu.id AS "cuentaId",
              cu."codigoInterno",
              cu.nombre AS "nombreCuenta",
              cu.naturaleza,
              COALESCE(SUM(lc."debitoBob"), 0) AS "totalDebitoBob",
              COALESCE(SUM(lc."creditoBob"), 0) AS "totalCreditoBob"
            FROM lineas_comprobante lc
            JOIN comprobantes c ON c.id = lc."comprobanteId"
            JOIN cuentas cu ON cu.id = lc."cuentaId"
            WHERE lc."organizationId" = ${tenantId}
              AND c.estado IN ('CONTABILIZADO','BLOQUEADO')
              AND c."fechaContable" < ${filtros.fechaDesde}
            GROUP BY cu.id, cu."codigoInterno", cu.nombre, cu.naturaleza
          `
        : await this.prisma.$queryRaw`
            SELECT
              cu.id AS "cuentaId",
              cu."codigoInterno",
              cu.nombre AS "nombreCuenta",
              cu.naturaleza,
              COALESCE(SUM(lc."debitoBob"), 0) AS "totalDebitoBob",
              COALESCE(SUM(lc."creditoBob"), 0) AS "totalCreditoBob"
            FROM lineas_comprobante lc
            JOIN comprobantes c ON c.id = lc."comprobanteId"
            JOIN cuentas cu ON cu.id = lc."cuentaId"
            WHERE lc."organizationId" = ${tenantId}
              AND c.estado IN ('CONTABILIZADO','BLOQUEADO')
              AND c."fechaContable" < ${filtros.fechaDesde}
              AND c.anulado = false
            GROUP BY cu.id, cu."codigoInterno", cu.nombre, cu.naturaleza
          `;

    // Postgres retorna `numeric` (y COALESCE result) como string en $queryRaw → Decimal
    return rows.map((r) => ({
      ...r,
      naturaleza: r.naturaleza as NaturalezaCuenta,
      totalDebitoBob: new Decimal(r.totalDebitoBob),
      totalCreditoBob: new Decimal(r.totalCreditoBob),
    }));
  }

  async obtenerCuentaDetalle(
    tenantId: string,
    cuentaId: string,
  ): Promise<CuentaDetalleResult | null> {
    // Prisma findFirst es suficiente — simple lookup por PK con tenantId (defense in depth §4.2).
    // No necesita $queryRaw.
    const cuenta = await this.prisma.cuenta.findFirst({
      where: {
        id: cuentaId,
        organizationId: tenantId,
      },
      select: {
        id: true,
        esDetalle: true,
      },
    });

    return cuenta ?? null;
  }
}
