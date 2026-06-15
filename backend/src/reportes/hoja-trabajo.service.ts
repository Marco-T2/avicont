import { Inject, Injectable } from '@nestjs/common';

import {
  PERIODOS_READER_PORT,
  PeriodosReaderPort,
} from '@/periodos-fiscales/ports/periodos-reader.port';

import { construirHojaTrabajo } from './domain/hoja-trabajo';
import {
  PeriodoNoEncontradoError,
  RangoAmbiguoError,
  RangoInvalidoError,
  RangoRequeridoError,
} from './domain/hoja-trabajo-errors';
import type { HojaTrabajoResponseDto } from './dto/hoja-trabajo-response.dto';
import { toHojaTrabajoResponse } from './dto/hoja-trabajo-response.dto';
import { EEFF_SALDOS_READER_PORT, EeffSaldosReaderPort } from './ports/eeff-saldos-reader.port';
import { parseFechaContable } from './fecha-contable';

@Injectable()
export class HojaTrabajoService {
  constructor(
    @Inject(EEFF_SALDOS_READER_PORT)
    private readonly eeffSaldosReader: EeffSaldosReaderPort,
    @Inject(PERIODOS_READER_PORT)
    private readonly periodosReader: PeriodosReaderPort,
  ) {}

  /**
   * Consulta la Hoja de Trabajo de 12 columnas para el tenant activo.
   *
   * Orquesta:
   *  1. Resolver el modo del rango (XOR `desde`/`hasta` vs `periodoFiscalId`) →
   *     errores RANGO_REQUERIDO / RANGO_AMBIGUO.
   *  2. Resolver `[desde, hasta]` (parseo directo o `obtenerRangoFechas`) →
   *     RANGO_INVALIDO / PERIODO_NO_ENCONTRADO.
   *  3. Promise.all([obtenerSaldosEnRangoSeparandoAjustes, obtenerEstructuraCuentas]).
   *     NUNCA `obtenerSaldosEnRango` ni `obtenerSaldosHasta`.
   *  4. Delegar construcción al builder puro `hoja-trabajo.ts`.
   *  5. Mapear a HojaTrabajoResponseDto.
   *
   * @param tenantId - organizationId del JWT activo (CLAUDE.md §4.2)
   * @param query    - Parámetros de la consulta
   */
  async consultarHojaTrabajo(
    tenantId: string,
    query: {
      desde?: string;
      hasta?: string;
      periodoFiscalId?: string;
      incluirAnulados: boolean;
    },
  ): Promise<HojaTrabajoResponseDto> {
    const tieneRango = query.desde !== undefined || query.hasta !== undefined;
    const tienePeriodo = query.periodoFiscalId !== undefined;

    // ── 1. XOR de modos (REQ-HT-01) ───────────────────────────────────────
    if (tieneRango && tienePeriodo) {
      throw new RangoAmbiguoError();
    }
    if (!tieneRango && !tienePeriodo) {
      throw new RangoRequeridoError();
    }

    // ── 2. Resolver [desde, hasta] ────────────────────────────────────────
    let desde: Date;
    let hasta: Date;

    if (tieneRango) {
      // Modo rango: ambas fechas requeridas y coherentes (REQ-HT-02).
      const desdeParsed = query.desde ? parseFechaContable(query.desde) : null;
      const hastaParsed = query.hasta ? parseFechaContable(query.hasta) : null;

      if (!desdeParsed || !hastaParsed || desdeParsed > hastaParsed) {
        throw new RangoInvalidoError();
      }

      desde = desdeParsed;
      hasta = hastaParsed;
    } else {
      // Modo período (REQ-HT-01/02). El `!` es seguro: tienePeriodo === true aquí.
      const rango = await this.periodosReader.obtenerRangoFechas(tenantId, query.periodoFiscalId!);
      if (!rango) {
        throw new PeriodoNoEncontradoError();
      }
      desde = rango.desde;
      hasta = rango.hasta;
    }

    // ── 3. Saldos separados + estructura, en paralelo ─────────────────────
    // REQ-HT-21: usa obtenerSaldosEnRangoSeparandoAjustes, NUNCA obtenerSaldosEnRango
    // ni obtenerSaldosHasta — la Hoja de Trabajo necesita la separación ordinario/ajuste.
    const [saldosSeparados, estructura] = await Promise.all([
      this.eeffSaldosReader.obtenerSaldosEnRangoSeparandoAjustes(
        tenantId,
        desde,
        hasta,
        query.incluirAnulados,
      ),
      this.eeffSaldosReader.obtenerEstructuraCuentas(tenantId),
    ]);

    // ── 4. Construir con dominio puro ─────────────────────────────────────
    const result = construirHojaTrabajo({ estructura, saldosSeparados });

    // ── 5. Mapear a DTO de respuesta ──────────────────────────────────────
    return toHojaTrabajoResponse(result, { desde, hasta });
  }
}
