import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '@/common/prisma.service';
import {
  AltasPorMes,
  CategoryCount,
  PlatformDashboardData,
  PlatformStatsReaderPort,
} from '@/platform/ports/platform-stats-reader.port';

/** Fila tipada que devuelve el $queryRaw de date_trunc. */
interface AltasPorMesRow {
  year: bigint;
  month: bigint;
  count: bigint;
}

/**
 * Adapter Prisma para PlatformStatsReaderPort.
 *
 * El módulo `tenants` es dueño de Organization, por lo que el adapter vive acá.
 * Se registra en PlatformModule con token PLATFORM_STATS_READER_PORT.
 *
 * ⚠️ EXCEPCIÓN ANTI-31 DELIBERADA: todas las queries son cross-tenant.
 * El enforcement de acceso está en SuperAdminGuard (CLAUDE.md §10.1).
 */
@Injectable()
export class PrismaPlatformStatsReaderAdapter extends PlatformStatsReaderPort {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  override async readDashboard(windowStart: Date): Promise<PlatformDashboardData> {
    const [statusGroups, planGroups, allOrgs, rawAltas] = await Promise.all([
      this.prisma.organization.groupBy({
        by: ['status'],
        _count: { _all: true },
        orderBy: { status: 'asc' },
      }),
      this.prisma.organization.groupBy({
        by: ['plan'],
        _count: { _all: true },
        orderBy: { plan: 'asc' },
      }),
      this.prisma.organization.findMany({
        select: { contabilidadEnabled: true, granjaEnabled: true },
      }),
      // Serie de altas: date_trunc('month') sobre createdAt (timestamptz UTC — CLAUDE.md §4.6).
      // $queryRaw evita el GROUP BY de Prisma que requiere todos los campos.
      this.prisma.$queryRaw<AltasPorMesRow[]>(
        Prisma.sql`
          SELECT
            EXTRACT(YEAR  FROM date_trunc('month', "createdAt"))::bigint AS year,
            EXTRACT(MONTH FROM date_trunc('month', "createdAt"))::bigint AS month,
            COUNT(*)::bigint                                              AS count
          FROM organizations
          WHERE "createdAt" >= ${windowStart}
          GROUP BY date_trunc('month', "createdAt")
          ORDER BY date_trunc('month', "createdAt") ASC
        `,
      ),
    ]);

    const orgsPorStatus: CategoryCount[] = statusGroups.map((g) => ({
      category: g.status,
      count: g._count._all,
    }));

    const orgsPorPlan: CategoryCount[] = planGroups.map((g) => ({
      category: g.plan,
      count: g._count._all,
    }));

    const orgsPorVertical: CategoryCount[] = this.calcularVertical(allOrgs);

    const altasPorMes: AltasPorMes[] = this.buildSerie(rawAltas, windowStart);

    return { orgsPorStatus, orgsPorPlan, orgsPorVertical, altasPorMes };
  }

  /**
   * Clasifica cada org en uno de los 3 cubos de vertical.
   * Contabilidad y Granja son mutuamente excluyentes por el CHECK constraint;
   * si ninguno está activo → "otros".
   */
  private calcularVertical(
    orgs: { contabilidadEnabled: boolean; granjaEnabled: boolean }[],
  ): CategoryCount[] {
    let contabilidad = 0;
    let granja = 0;
    let otros = 0;

    for (const org of orgs) {
      if (org.contabilidadEnabled) {
        contabilidad++;
      } else if (org.granjaEnabled) {
        granja++;
      } else {
        otros++;
      }
    }

    const result: CategoryCount[] = [];
    if (contabilidad > 0) result.push({ category: 'contabilidad', count: contabilidad });
    if (granja > 0) result.push({ category: 'granja', count: granja });
    if (otros > 0) result.push({ category: 'otros', count: otros });
    return result;
  }

  /**
   * Construye la serie fija de 12 meses rellenando los meses sin altas con count=0.
   * Los valores de BigInt del $queryRaw se convierten a number.
   */
  private buildSerie(rawRows: AltasPorMesRow[], windowStart: Date): AltasPorMes[] {
    // Mapa de "YYYY-MM" → count desde los resultados de la BD
    const byMonth = new Map<string, number>();
    for (const row of rawRows) {
      const key = `${Number(row.year)}-${String(Number(row.month)).padStart(2, '0')}`;
      byMonth.set(key, Number(row.count));
    }

    const serie: AltasPorMes[] = [];
    const cursor = new Date(Date.UTC(windowStart.getUTCFullYear(), windowStart.getUTCMonth(), 1));
    const now = new Date();
    const endYear = now.getUTCFullYear();
    const endMonth = now.getUTCMonth() + 1; // 1-based

    // Generar exactamente 12 entradas
    for (let i = 0; i < 12; i++) {
      const year = cursor.getUTCFullYear();
      const month = cursor.getUTCMonth() + 1; // 1-based
      const key = `${year}-${String(month).padStart(2, '0')}`;
      serie.push({ year, month, count: byMonth.get(key) ?? 0 });
      cursor.setUTCMonth(cursor.getUTCMonth() + 1);

      // Parar si ya llegamos al mes actual
      if (year === endYear && month === endMonth) break;
    }

    return serie;
  }
}
