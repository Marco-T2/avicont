import { Injectable } from '@nestjs/common';
import type {
  ClaseCuenta as PrismaClaseCuenta,
  SubClaseCuenta as PrismaSubClaseCuenta,
} from '@prisma/client';
import { Prisma } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

import { PrismaService } from '@/common/prisma.service';

import type {
  BalanceFiltros,
  CuentaEstructuraRow,
  SaldoCuentaRow,
  SaldoCuentaSeparadoRow,
} from '../ports/eeff-saldos-reader.port';
import { EeffSaldosReaderPort } from '../ports/eeff-saldos-reader.port';
import {
  toDominioClaseCuenta,
  toDominioNaturalezaCuenta,
  toDominioSubClaseCuenta,
} from './enum-mappers';

/**
 * Adapter Prisma para `EeffSaldosReaderPort`.
 *
 * Sirve a Balance General (obtenerSaldosHasta + obtenerSaldosEnRango para Resultado)
 * y al Estado de Resultados (obtenerSaldosEnRango para el flujo del período).
 *
 * Design decisión: $queryRaw para obtenerSaldosHasta y obtenerSaldosEnRango porque:
 *   - Los EEFF necesitan GROUP BY cuentaId de las líneas, filtrando por la fecha
 *     de la CABECERA del comprobante.
 *   - Prisma groupBy NO soporta filtros sobre relaciones.
 *
 * Defense in depth (CLAUDE.md §4.2, Anti-31):
 *   `lc."organizationId" = ${tenantId}` SIEMPRE como PRIMER predicado.
 *   No confiamos en que el caller ya filtró.
 *
 * Estado FIJO: `c.estado IN ('CONTABILIZADO','BLOQUEADO')` nunca parametrizable.
 * BORRADOR NUNCA incluido (REQ-BG-03, REQ-ER-03).
 */
@Injectable()
export class PrismaEeffSaldosReaderAdapter extends EeffSaldosReaderPort {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async obtenerSaldosHasta(tenantId: string, filtros: BalanceFiltros): Promise<SaldoCuentaRow[]> {
    // Defense in depth (CLAUDE.md §4.2): primer predicado siempre.
    // Estado FIJO: CONTABILIZADO/BLOQUEADO. BORRADOR nunca (REQ-BG-03).
    // Se ramifica en 2 statements para el toggle anulados (no parametrizable — patrón del Mayor).
    type RawRow = { cuentaId: string; totalDebitoBob: string; totalCreditoBob: string };

    const rows: RawRow[] = filtros.incluirAnulados
      ? await this.prisma.$queryRaw<RawRow[]>`
          SELECT
            lc."cuentaId"                        AS "cuentaId",
            COALESCE(SUM(lc."debitoBob"), 0)     AS "totalDebitoBob",
            COALESCE(SUM(lc."creditoBob"), 0)    AS "totalCreditoBob"
          FROM lineas_comprobante lc
          JOIN comprobantes c ON c.id = lc."comprobanteId"
          WHERE lc."organizationId" = ${tenantId}
            AND c.estado IN ('CONTABILIZADO','BLOQUEADO')
            AND c."fechaContable" <= ${filtros.fechaCorte}
          GROUP BY lc."cuentaId"
        `
      : await this.prisma.$queryRaw<RawRow[]>`
          SELECT
            lc."cuentaId"                        AS "cuentaId",
            COALESCE(SUM(lc."debitoBob"), 0)     AS "totalDebitoBob",
            COALESCE(SUM(lc."creditoBob"), 0)    AS "totalCreditoBob"
          FROM lineas_comprobante lc
          JOIN comprobantes c ON c.id = lc."comprobanteId"
          WHERE lc."organizationId" = ${tenantId}
            AND c.estado IN ('CONTABILIZADO','BLOQUEADO')
            AND c."fechaContable" <= ${filtros.fechaCorte}
            AND c.anulado = false
          GROUP BY lc."cuentaId"
        `;

    return rows.map((row) => ({
      cuentaId: row.cuentaId,
      // Postgres devuelve numeric como string en $queryRaw — convertir a Decimal
      totalDebitoBob: new Decimal(row.totalDebitoBob),
      totalCreditoBob: new Decimal(row.totalCreditoBob),
    }));
  }

  async obtenerSaldosEnRango(
    tenantId: string,
    desde: Date,
    hasta: Date,
    incluirAnulados: boolean,
  ): Promise<SaldoCuentaRow[]> {
    // Defense in depth (CLAUDE.md §4.2): primer predicado siempre.
    // NCB / NIC 1: Estado de Resultados de flujo del período, sin arrastre histórico.
    // Solo líneas con fechaContable en [desde, hasta] — garantía de flujo (REQ-ER-02).
    type RawRow = { cuentaId: string; totalDebitoBob: string; totalCreditoBob: string };

    const where = this.whereBaseRango(tenantId, desde, hasta, incluirAnulados);

    const rows = await this.prisma.$queryRaw<RawRow[]>(Prisma.sql`
      SELECT
        lc."cuentaId"                        AS "cuentaId",
        COALESCE(SUM(lc."debitoBob"), 0)     AS "totalDebitoBob",
        COALESCE(SUM(lc."creditoBob"), 0)    AS "totalCreditoBob"
      FROM lineas_comprobante lc
      JOIN comprobantes c ON c.id = lc."comprobanteId"
      WHERE ${where}
      GROUP BY lc."cuentaId"
    `);

    return rows.map((row) => ({
      cuentaId: row.cuentaId,
      totalDebitoBob: new Decimal(row.totalDebitoBob),
      totalCreditoBob: new Decimal(row.totalCreditoBob),
    }));
  }

  async obtenerSaldosEnRangoSeparandoAjustes(
    tenantId: string,
    desde: Date,
    hasta: Date,
    incluirAnulados: boolean,
  ): Promise<SaldoCuentaSeparadoRow[]> {
    // Defense in depth (CLAUDE.md §4.2): organizationId SIEMPRE primer predicado (Anti-31).
    // Los comprobantes de tipo CIERRE se excluyen SIEMPRE (§4.9 CLAUDE.md): distorsionan
    // las secciones ER/BG de la Hoja de Trabajo al llevar saldos a cero con
    // contrapartidas cruzadas que no corresponden al período analizado.
    // El FILTER (WHERE c.tipo = 'AJUSTE') y NOT IN ('AJUSTE','CIERRE') separan los movimientos.
    type RawRow = {
      cuentaId: string;
      debitoOrdinarioBob: string;
      creditoOrdinarioBob: string;
      debitoAjusteBob: string;
      creditoAjusteBob: string;
    };

    const where = this.whereBaseRango(tenantId, desde, hasta, incluirAnulados);

    const rows = await this.prisma.$queryRaw<RawRow[]>(Prisma.sql`
      SELECT
        lc."cuentaId"                                                              AS "cuentaId",
        COALESCE(SUM(lc."debitoBob")  FILTER (WHERE c.tipo NOT IN ('AJUSTE','CIERRE')), 0) AS "debitoOrdinarioBob",
        COALESCE(SUM(lc."creditoBob") FILTER (WHERE c.tipo NOT IN ('AJUSTE','CIERRE')), 0) AS "creditoOrdinarioBob",
        COALESCE(SUM(lc."debitoBob")  FILTER (WHERE c.tipo = 'AJUSTE'), 0)         AS "debitoAjusteBob",
        COALESCE(SUM(lc."creditoBob") FILTER (WHERE c.tipo = 'AJUSTE'), 0)         AS "creditoAjusteBob"
      FROM lineas_comprobante lc
      JOIN comprobantes c ON c.id = lc."comprobanteId"
      WHERE ${where}
        AND c.tipo <> 'CIERRE'
      GROUP BY lc."cuentaId"
    `);

    return rows.map((row) => ({
      cuentaId: row.cuentaId,
      debitoOrdinarioBob: new Decimal(row.debitoOrdinarioBob),
      creditoOrdinarioBob: new Decimal(row.creditoOrdinarioBob),
      debitoAjusteBob: new Decimal(row.debitoAjusteBob),
      creditoAjusteBob: new Decimal(row.creditoAjusteBob),
    }));
  }

  async obtenerEstructuraCuentas(tenantId: string): Promise<CuentaEstructuraRow[]> {
    // Defense in depth (CLAUDE.md §4.2): organizationId filtro obligatorio.
    // findMany simple — no necesita $queryRaw (lookup escalar scoped por tenant).
    const cuentas = await this.prisma.cuenta.findMany({
      where: {
        organizationId: tenantId,
        activa: true,
      },
      select: {
        id: true,
        parentId: true,
        nivel: true,
        esDetalle: true,
        esContraria: true,
        claseCuenta: true,
        subClaseCuenta: true,
        naturaleza: true,
        codigoInterno: true,
        nombre: true,
      },
      orderBy: [{ codigoInterno: 'asc' }],
    });

    return cuentas.map((c) => ({
      id: c.id,
      parentId: c.parentId,
      nivel: c.nivel,
      esDetalle: c.esDetalle,
      esContraria: c.esContraria,
      claseCuenta: toDominioClaseCuenta(c.claseCuenta as PrismaClaseCuenta),
      subClaseCuenta:
        c.subClaseCuenta !== null
          ? toDominioSubClaseCuenta(c.subClaseCuenta as PrismaSubClaseCuenta)
          : null,
      naturaleza: toDominioNaturalezaCuenta(c.naturaleza),
      codigoInterno: c.codigoInterno,
      nombre: c.nombre,
    }));
  }

  /**
   * Predicado base compartido para queries de rango [desde, hasta].
   *
   * Centraliza el patrón Anti-31 + estado FIJO + toggle anulados en UN solo lugar
   * para que `obtenerSaldosEnRango` y `obtenerSaldosEnRangoSeparandoAjustes` no
   * dupliquen el WHERE — anti-drift.
   *
   * Orden de predicados (§4.2 CLAUDE.md, Anti-31):
   *   1. organizationId SIEMPRE primero (defense in depth — no confiamos en el caller).
   *   2. estado IN ('CONTABILIZADO','BLOQUEADO') FIJO — BORRADOR nunca.
   *   3. rango fechaContable.
   *   4. anulado = false SOLO si !incluirAnulados (§4.7 CLAUDE.md).
   *
   * El caller puede agregar predicados adicionales después del fragmento retornado
   * (p.ej. `AND c.tipo <> 'CIERRE'`).
   */
  private whereBaseRango(
    tenantId: string,
    desde: Date,
    hasta: Date,
    incluirAnulados: boolean,
  ): Prisma.Sql {
    const anuladoClause = incluirAnulados ? Prisma.empty : Prisma.sql`AND c.anulado = false`;

    return Prisma.sql`
      lc."organizationId" = ${tenantId}
        AND c.estado IN ('CONTABILIZADO','BLOQUEADO')
        AND c."fechaContable" >= ${desde}
        AND c."fechaContable" <= ${hasta}
        ${anuladoClause}
    `;
  }
}
