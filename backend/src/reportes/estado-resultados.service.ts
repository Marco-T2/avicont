import { Inject, Injectable } from '@nestjs/common';

import {
  PERIODOS_READER_PORT,
  PeriodosReaderPort,
} from '@/periodos-fiscales/ports/periodos-reader.port';

import {
  GestionNoEncontradaError,
  PeriodoNoEncontradoError,
  RangoInvalidoError,
} from './domain/resultados-errors';
import { construirEstadoResultados } from './domain/resultados-arbol';
import type { EstadoResultadosResponseDto } from './dto/eeff-resultados-response.dto';
import { toEstadoResultadosResponse } from './dto/eeff-resultados-response.dto';
import { EEFF_SALDOS_READER_PORT, EeffSaldosReaderPort } from './ports/eeff-saldos-reader.port';

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
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month || date.getUTCDate() !== day) {
    return null;
  }

  return date;
}

@Injectable()
export class EstadoResultadosService {
  constructor(
    @Inject(EEFF_SALDOS_READER_PORT)
    private readonly eeffSaldosReader: EeffSaldosReaderPort,
    @Inject(PERIODOS_READER_PORT)
    private readonly periodosReader: PeriodosReaderPort,
  ) {}

  /**
   * Consulta el Estado de Resultados (Income Statement) para el tenant activo.
   *
   * Orquesta:
   *  1. Resolver rango [desde, hasta] según la forma provista.
   *     Prioridad: fechaDesde+fechaHasta > periodoFiscalId > gestionId.
   *  2. Promise.all([obtenerSaldosEnRango, obtenerEstructuraCuentas]) en paralelo.
   *     NUNCA obtenerSaldosHasta — garantía de flujo (REQ-ER-02).
   *  3. Construir árbol con resultados-arbol.ts (función pura).
   *  4. Mapear a EstadoResultadosResponseDto.
   *
   * @param tenantId - organizationId del JWT activo (CLAUDE.md §4.2)
   * @param query    - Parámetros de la consulta
   */
  async consultarEstadoResultados(
    tenantId: string,
    query: {
      fechaDesde?: string;
      fechaHasta?: string;
      periodoFiscalId?: string;
      gestionId?: string;
      incluirAnulados?: boolean;
    },
  ): Promise<EstadoResultadosResponseDto> {
    const incluirAnulados = query.incluirAnulados ?? false;

    // ── 1. Resolver rango según forma provista (prioridad: fechas > periodo > gestion) ──
    let desde: Date;
    let hasta: Date;

    if (query.fechaDesde !== undefined || query.fechaHasta !== undefined) {
      // Forma 1: rango directo — ambas fechas requeridas juntas
      const desdeParsed = query.fechaDesde ? parseFechaContable(query.fechaDesde) : null;
      const hastaParsed = query.fechaHasta ? parseFechaContable(query.fechaHasta) : null;

      if (!desdeParsed || !hastaParsed) {
        throw new RangoInvalidoError();
      }

      if (desdeParsed > hastaParsed) {
        throw new RangoInvalidoError();
      }

      desde = desdeParsed;
      hasta = hastaParsed;
    } else if (query.periodoFiscalId !== undefined) {
      // Forma 2: por período fiscal
      const rango = await this.periodosReader.obtenerRangoFechas(tenantId, query.periodoFiscalId);
      if (!rango) {
        throw new PeriodoNoEncontradoError();
      }
      desde = rango.desde;
      hasta = rango.hasta;
    } else if (query.gestionId !== undefined) {
      // Forma 3: por gestión fiscal
      const rango = await this.periodosReader.obtenerRangoGestion(tenantId, query.gestionId);
      if (!rango) {
        throw new GestionNoEncontradaError();
      }
      desde = rango.desde;
      hasta = rango.hasta;
    } else {
      // Ninguna forma provista
      throw new RangoInvalidoError();
    }

    // ── 2. Consultar saldos de flujo y estructura en paralelo ──────────────────
    // NCB / NIC 1: SOLO obtenerSaldosEnRango — garantía de flujo (REQ-ER-02).
    // Las cuentas de resultado parten de 0 al inicio del rango.
    const [saldosRango, estructura] = await Promise.all([
      this.eeffSaldosReader.obtenerSaldosEnRango(tenantId, desde, hasta, incluirAnulados),
      this.eeffSaldosReader.obtenerEstructuraCuentas(tenantId),
    ]);

    // ── 3. Construir árbol con función pura ────────────────────────────────────
    const arbol = construirEstadoResultados({ estructura, saldosRango });

    // ── 4. Mapear a DTO de respuesta ───────────────────────────────────────────
    return toEstadoResultadosResponse(arbol, { desde, hasta });
  }
}
