/**
 * DashboardService de Granja.
 *
 * Implementa el patrón 3-queries (design.md §6 — anti-N×2):
 *   1. loteRepo.listar(org, { estado: ACTIVO }) — 1 query
 *   2. reader.agregadosPorLotes(org, loteIds) — 2 queries batch (groupBy IN)
 *   3. ResumenLote.calcular por cada lote — cálculo puro en memoria
 * Total constante: 3 queries sin importar N lotes.
 *
 * edadDias usa ClockPort.currentDateLaPaz() — NUNCA new Date() (CLAUDE.md §4.6).
 * Defense in depth (CLAUDE.md §4.2): pasa organizationId a CADA llamada.
 */

import { Inject, Injectable } from '@nestjs/common';

import { CLOCK_PORT, ClockPort } from '@/common/clock/clock.port';
import { Money } from '@/common/domain/money';

import { EstadoLote } from './domain/enums';
import { ResumenLote } from './domain/resumen-lote';
import { LOTE_RESUMEN_READER_PORT, LoteResumenReaderPort } from './ports/lote-resumen-reader.port';
import { LOTE_REPOSITORY_PORT, LoteRepositoryPort, LoteRow } from './ports/lote.repository.port';

export interface LoteConResumen {
  lote: LoteRow;
  resumen: ResumenLote;
  /** edadDias = HOY − fechaIngreso (calendario La Paz, via ClockPort) */
  edadDias: number;
}

/** Paginación grande para traer todos los lotes activos del dashboard. */
const DASHBOARD_PAGINATION = { page: 1, limit: 1000 };

@Injectable()
export class DashboardService {
  constructor(
    @Inject(LOTE_REPOSITORY_PORT)
    private readonly loteRepo: LoteRepositoryPort,
    @Inject(LOTE_RESUMEN_READER_PORT)
    private readonly reader: LoteResumenReaderPort,
    @Inject(CLOCK_PORT)
    private readonly clock: ClockPort,
  ) {}

  /**
   * Retorna los lotes ACTIVO de la org con su resumen calculado (anti-N×2).
   * El costo por pollo NUNCA se agrega a nivel org (cada lote es independiente).
   */
  async lotesActivosConResumen(organizationId: string): Promise<LoteConResumen[]> {
    // Paso 1: listar lotes ACTIVO (1 query)
    const { items: lotes } = await this.loteRepo.listar(
      organizationId,
      { estado: EstadoLote.ACTIVO },
      DASHBOARD_PAGINATION,
    );

    if (lotes.length === 0) return [];

    // Paso 2: agregar en batch (2 queries constantes via groupBy IN)
    const loteIds = lotes.map((l) => l.id);
    const agregados = await this.reader.agregadosPorLotes(organizationId, loteIds);

    // Construir Map para O(1) lookup
    const agregadosMap = new Map(agregados.map((a) => [a.loteId, a]));

    // "Hoy" en La Paz — del ClockPort, no de new Date() (CLAUDE.md §4.6)
    const hoyStr = this.clock.currentDateLaPaz();
    const hoy = new Date(hoyStr);

    // Paso 3: calcular ResumenLote en memoria (puro, sin queries)
    return lotes.map((lote): LoteConResumen => {
      const ag = agregadosMap.get(lote.id) ?? {
        loteId: lote.id,
        totalMuertes: 0,
        totalInversionBob: '0',
      };

      // D5: el reader devuelve string; envolvemos en Money aquí en el dominio
      const costoAcumulado = Money.of(ag.totalInversionBob);

      const resumen = ResumenLote.calcular({
        loteId: lote.id,
        cantidadInicial: lote.cantidadInicial,
        totalMuertes: ag.totalMuertes,
        costoAcumulado,
      });

      // edadDias: diff calendario entre hoy y fechaIngreso
      const ingreso = new Date(lote.fechaIngreso);
      const diffMs = hoy.getTime() - ingreso.getTime();
      const edadDias = Math.floor(diffMs / (1000 * 60 * 60 * 24));

      return { lote, resumen, edadDias };
    });
  }

  /**
   * Informe detallado de un solo lote (totales + resumen).
   * Usado en el detalle del lote (GET /lotes/:id).
   */
  async informeLote(organizationId: string, loteRow: LoteRow): Promise<LoteConResumen> {
    const agregados = await this.reader.agregadosPorLotes(organizationId, [loteRow.id]);
    const ag = agregados[0] ?? {
      loteId: loteRow.id,
      totalMuertes: 0,
      totalInversionBob: '0',
    };

    const costoAcumulado = Money.of(ag.totalInversionBob);

    const resumen = ResumenLote.calcular({
      loteId: loteRow.id,
      cantidadInicial: loteRow.cantidadInicial,
      totalMuertes: ag.totalMuertes,
      costoAcumulado,
    });

    const hoyStr = this.clock.currentDateLaPaz();
    const hoy = new Date(hoyStr);
    const ingreso = new Date(loteRow.fechaIngreso);
    const edadDias = Math.floor((hoy.getTime() - ingreso.getTime()) / (1000 * 60 * 60 * 24));

    return { lote: loteRow, resumen, edadDias };
  }
}
