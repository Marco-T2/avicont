import { Inject, Injectable } from '@nestjs/common';

import {
  PERIODOS_READER_PORT,
  PeriodosReaderPort,
} from '@/periodos-fiscales/ports/periodos-reader.port';

import { construirBalance } from './domain/balance-arbol';
import { FechaCorteInvalidaError, GestionNoEncontradaError } from './domain/balance-errors';
import { toBalanceResponse } from './dto/balance-response.dto';
import type { BalanceResponseDto } from './dto/balance-response.dto';
import { EEFF_SALDOS_READER_PORT, EeffSaldosReaderPort } from './ports/eeff-saldos-reader.port';
import { parseFechaContable } from './fecha-contable';

@Injectable()
export class BalanceGeneralService {
  constructor(
    @Inject(EEFF_SALDOS_READER_PORT)
    private readonly balanceReader: EeffSaldosReaderPort,
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
      const rangoConId = await this.periodosReader.obtenerRangoGestionPorFecha(
        tenantId,
        fechaCorte,
      );
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
