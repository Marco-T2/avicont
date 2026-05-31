import { Injectable } from '@nestjs/common';
import type { ClaseCuenta, NaturalezaCuenta, SubClaseCuenta } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

import { PrismaService } from '@/common/prisma.service';

import type {
  BalanceFiltros,
  CuentaEstructuraRow,
  SaldoCuentaRow,
} from '../ports/eeff-saldos-reader.port';
import { EeffSaldosReaderPort } from '../ports/eeff-saldos-reader.port';

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

    const rows: RawRow[] = incluirAnulados
      ? await this.prisma.$queryRaw<RawRow[]>`
          SELECT
            lc."cuentaId"                        AS "cuentaId",
            COALESCE(SUM(lc."debitoBob"), 0)     AS "totalDebitoBob",
            COALESCE(SUM(lc."creditoBob"), 0)    AS "totalCreditoBob"
          FROM lineas_comprobante lc
          JOIN comprobantes c ON c.id = lc."comprobanteId"
          WHERE lc."organizationId" = ${tenantId}
            AND c.estado IN ('CONTABILIZADO','BLOQUEADO')
            AND c."fechaContable" >= ${desde}
            AND c."fechaContable" <= ${hasta}
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
            AND c."fechaContable" >= ${desde}
            AND c."fechaContable" <= ${hasta}
            AND c.anulado = false
          GROUP BY lc."cuentaId"
        `;

    return rows.map((row) => ({
      cuentaId: row.cuentaId,
      totalDebitoBob: new Decimal(row.totalDebitoBob),
      totalCreditoBob: new Decimal(row.totalCreditoBob),
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
      claseCuenta: c.claseCuenta as ClaseCuenta,
      subClaseCuenta: c.subClaseCuenta as SubClaseCuenta | null,
      naturaleza: c.naturaleza as NaturalezaCuenta,
      codigoInterno: c.codigoInterno,
      nombre: c.nombre,
    }));
  }
}
