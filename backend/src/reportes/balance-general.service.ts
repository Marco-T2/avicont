import { Inject, Injectable } from '@nestjs/common';

import {
  PERIODOS_READER_PORT,
  PeriodosReaderPort,
} from '@/periodos-fiscales/ports/periodos-reader.port';

import { construirBalance } from './domain/balance-arbol';
import { FechaCorteInvalidaError, GestionNoEncontradaError } from './domain/balance-errors';
import { toBalanceResponse } from './dto/balance-response.dto';
import type { BalanceResponseDto } from './dto/balance-response.dto';
import { BALANCE_READER_PORT, BalanceReaderPort } from './ports/balance-reader.port';

/**
 * Parsea "YYYY-MM-DD" a Date UTC (§4.6 CLAUDE.md — FechaContable calendario puro).
 * Construimos explícitamente en UTC para evitar parse implementation-defined.
 * PROHIBIDO usar new Date(string) directamente en domain/service (§4.6).
 * Este helper parsea fechas provistas por el cliente, no genera "hoy".
 *
 * Retorna null si la cadena no tiene el formato esperado o los valores no son válidos.
 */
function parseFechaContable(fecha: string): Date | null {
  if (!fecha || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return null;

  const parts = fecha.split('-');
  const year = parseInt(parts[0] ?? '0', 10);
  const month = parseInt(parts[1] ?? '0', 10) - 1; // 0-indexed
  const day = parseInt(parts[2] ?? '0', 10);

  if (isNaN(year) || isNaN(month) || isNaN(day)) return null;

  const date = new Date(Date.UTC(year, month, day));
  // Validar que la fecha resultante tiene los mismos valores (evita fechas como 2026-02-30)
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return date;
}

@Injectable()
export class BalanceGeneralService {
  constructor(
    @Inject(BALANCE_READER_PORT)
    private readonly balanceReader: BalanceReaderPort,
    @Inject(PERIODOS_READER_PORT)
    private readonly periodosReader: PeriodosReaderPort,
  ) {}

  /**
   * Consulta el Balance General (Estado de Situación Financiera) para el tenant activo.
   *
   * Orquesta:
   *  1. Validar/parsear fecha de corte → Date (FechaCorteInvalidaError si no parsea).
   *  2. Resolver rango de la gestión vigente:
   *     - si gestionId provisto → periodosReader.obtenerRangoGestion
   *     - si no → periodosReader.obtenerRangoGestionPorFecha
   *     → GestionNoEncontradaError si null.
   *  3. Calcular hastaEfectivo = min(hasta_gestion, fechaCorte).
   *  4. Promise.all([obtenerSaldosHasta, obtenerSaldosEnRango, obtenerEstructuraCuentas]).
   *  5. Delegar construcción del árbol a balance-arbol.ts (función pura).
   *  6. Mapear a BalanceResponseDto.
   *
   * @param tenantId - organizationId del JWT activo (CLAUDE.md §4.2)
   * @param query    - Parámetros de la consulta
   */
  async consultarBalanceGeneral(
    tenantId: string,
    query: {
      fecha: string;
      gestionId?: string;
      incluirAnulados: boolean;
    },
  ): Promise<BalanceResponseDto> {
    // ── 1. Validar/parsear fecha de corte ────────────────────────────────
    const fechaCorte = parseFechaContable(query.fecha);
    if (!fechaCorte) {
      throw new FechaCorteInvalidaError();
    }

    // ── 2. Resolver rango de la gestión vigente ───────────────────────────
    let gestionId: string;
    let desde: Date;
    let hasta: Date;

    if (query.gestionId !== undefined) {
      const rango = await this.periodosReader.obtenerRangoGestion(tenantId, query.gestionId);
      if (!rango) {
        throw new GestionNoEncontradaError(query.fecha);
      }
      gestionId = query.gestionId;
      desde = rango.desde;
      hasta = rango.hasta;
    } else {
      const rangoConId = await this.periodosReader.obtenerRangoGestionPorFecha(tenantId, fechaCorte);
      if (!rangoConId) {
        throw new GestionNoEncontradaError(query.fecha);
      }
      gestionId = rangoConId.gestionId;
      desde = rangoConId.desde;
      hasta = rangoConId.hasta;
    }

    // ── 3. hastaEfectivo = min(hasta_gestion, fechaCorte) ─────────────────
    // Evitar sumar ingresos/egresos posteriores al corte dentro de la gestión vigente.
    const hastaEfectivo = hasta > fechaCorte ? fechaCorte : hasta;

    // ── 4. Consulta en paralelo (sin dependencia entre sí) ────────────────
    const [saldosHasta, saldosGestion, estructura] = await Promise.all([
      this.balanceReader.obtenerSaldosHasta(tenantId, {
        fechaCorte,
        incluirAnulados: query.incluirAnulados,
      }),
      this.balanceReader.obtenerSaldosEnRango(
        tenantId,
        desde,
        hastaEfectivo,
        query.incluirAnulados,
      ),
      this.balanceReader.obtenerEstructuraCuentas(tenantId),
    ]);

    // ── 5. Construir árbol con dominio puro ───────────────────────────────
    const arbol = construirBalance({ estructura, saldosHasta, saldosGestion });

    // ── 6. Mapear a DTO de respuesta ──────────────────────────────────────
    return toBalanceResponse(arbol, { fechaCorte, gestionId });
  }
}
