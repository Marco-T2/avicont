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
import { parseFechaContable } from './fecha-contable';

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
