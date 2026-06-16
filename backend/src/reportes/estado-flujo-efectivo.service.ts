import { Inject, Injectable } from '@nestjs/common';

import {
  PERIODOS_READER_PORT,
  PeriodosReaderPort,
} from '@/periodos-fiscales/ports/periodos-reader.port';

import { construirEstadoFlujoEfectivo } from './domain/estado-flujo-efectivo';
import {
  FlujoEfectivoPeriodoNoEncontradoError,
  FlujoEfectivoRangoAmbiguoError,
  FlujoEfectivoRangoInvalidoError,
  FlujoEfectivoRangoRequeridoError,
} from './domain/estado-flujo-efectivo-errors';
import { toEstadoFlujoEfectivoResponse } from './dto/estado-flujo-efectivo-response.dto';
import type { EstadoFlujoEfectivoResponseDto } from './dto/estado-flujo-efectivo-response.dto';
import { EEFF_SALDOS_READER_PORT, EeffSaldosReaderPort } from './ports/eeff-saldos-reader.port';
import { diaAnterior, parseFechaContable } from './fecha-contable';

@Injectable()
export class EstadoFlujoEfectivoService {
  constructor(
    @Inject(EEFF_SALDOS_READER_PORT)
    private readonly eeffSaldosReader: EeffSaldosReaderPort,
    @Inject(PERIODOS_READER_PORT)
    private readonly periodosReader: PeriodosReaderPort,
  ) {}

  /**
   * Consulta el Estado de Flujo de Efectivo (EFE) por método indirecto para el
   * tenant activo (NIC 7, supletoria de la NC N°11).
   *
   * Orquesta:
   *  1. Resolver el modo del rango (XOR `desde`/`hasta` vs `periodoFiscalId`) →
   *     RANGO_REQUERIDO / RANGO_AMBIGUO / RANGO_INVALIDO / PERIODO_NO_ENCONTRADO.
   *  2. Promise.all de 4 lecturas del port (cero método nuevo):
   *     - obtenerSaldosHasta(desde−1)        → saldo INICIAL (incl. efectivo)
   *     - obtenerSaldosHasta(hasta)          → saldo FINAL (incl. efectivo)
   *     - obtenerSaldosEnRango(desde, hasta) → resultado del ejercicio + flujo
   *     - obtenerEstructuraCuentas           → clasificación por actividad
   *  3. construirEstadoFlujoEfectivo (función pura).
   *  4. Mapear a EstadoFlujoEfectivoResponseDto.
   *
   * @param tenantId - organizationId del JWT activo (CLAUDE.md §4.2)
   */
  async consultarFlujoEfectivo(
    tenantId: string,
    query: {
      desde?: string;
      hasta?: string;
      periodoFiscalId?: string;
      incluirAnulados: boolean;
    },
  ): Promise<EstadoFlujoEfectivoResponseDto> {
    const tieneRango = query.desde !== undefined || query.hasta !== undefined;
    const tienePeriodo = query.periodoFiscalId !== undefined;

    // ── 1. XOR de modos (REQ-FE-01) ───────────────────────────────────────
    if (tieneRango && tienePeriodo) {
      throw new FlujoEfectivoRangoAmbiguoError();
    }
    if (!tieneRango && !tienePeriodo) {
      throw new FlujoEfectivoRangoRequeridoError();
    }

    // ── 2. Resolver [desde, hasta] (REQ-FE-02) ────────────────────────────
    let desde: Date;
    let hasta: Date;

    if (tieneRango) {
      const desdeParsed = query.desde ? parseFechaContable(query.desde) : null;
      const hastaParsed = query.hasta ? parseFechaContable(query.hasta) : null;

      if (!desdeParsed || !hastaParsed || desdeParsed > hastaParsed) {
        throw new FlujoEfectivoRangoInvalidoError();
      }

      desde = desdeParsed;
      hasta = hastaParsed;
    } else {
      // El `!` es seguro: tienePeriodo === true en esta rama.
      const rango = await this.periodosReader.obtenerRangoFechas(tenantId, query.periodoFiscalId!);
      if (!rango) {
        throw new FlujoEfectivoPeriodoNoEncontradoError();
      }
      desde = rango.desde;
      hasta = rango.hasta;
    }

    // ── 3. Lecturas en paralelo (cero método nuevo de port) ───────────────
    // El saldo inicial corta en el día PREVIO al inicio para que
    // saldoInicial + movimiento(rango) = saldoFinal (sin hueco ni solape).
    const [saldosInicial, saldosFinal, saldosRango, estructura] = await Promise.all([
      this.eeffSaldosReader.obtenerSaldosHasta(tenantId, {
        fechaCorte: diaAnterior(desde),
        incluirAnulados: query.incluirAnulados,
      }),
      this.eeffSaldosReader.obtenerSaldosHasta(tenantId, {
        fechaCorte: hasta,
        incluirAnulados: query.incluirAnulados,
      }),
      this.eeffSaldosReader.obtenerSaldosEnRango(tenantId, desde, hasta, query.incluirAnulados),
      this.eeffSaldosReader.obtenerEstructuraCuentas(tenantId),
    ]);

    // ── 4. Construir con función pura + mapear a DTO ──────────────────────
    const result = construirEstadoFlujoEfectivo({
      estructura,
      saldosInicial,
      saldosFinal,
      saldosRango,
    });

    return toEstadoFlujoEfectivoResponse(result, { desde, hasta });
  }
}
