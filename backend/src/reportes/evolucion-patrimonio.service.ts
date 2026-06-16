import { Inject, Injectable } from '@nestjs/common';

import {
  PERIODOS_READER_PORT,
  PeriodosReaderPort,
} from '@/periodos-fiscales/ports/periodos-reader.port';

import {
  GestionNoEncontradaError,
  PeriodoNoEncontradoError,
  RangoInvalidoError,
} from './domain/evolucion-patrimonio-errors';
import { construirEvolucionPatrimonio } from './domain/evolucion-patrimonio';
import type { EvolucionPatrimonioResponseDto } from './dto/evolucion-patrimonio-response.dto';
import { toEvolucionPatrimonioResponse } from './dto/evolucion-patrimonio-response.dto';
import { EEFF_SALDOS_READER_PORT, EeffSaldosReaderPort } from './ports/eeff-saldos-reader.port';
import { diaAnterior, parseFechaContable } from './fecha-contable';

@Injectable()
export class EvolucionPatrimonioService {
  constructor(
    @Inject(EEFF_SALDOS_READER_PORT)
    private readonly eeffSaldosReader: EeffSaldosReaderPort,
    @Inject(PERIODOS_READER_PORT)
    private readonly periodosReader: PeriodosReaderPort,
  ) {}

  /**
   * Consulta el Estado de Evolución del Patrimonio Neto (EEPN) para el tenant activo.
   *
   * Orquesta:
   *  1. Resolver rango [desde, hasta] según la forma provista.
   *     Prioridad: fechaDesde+fechaHasta > periodoFiscalId > gestionId.
   *  2. Promise.all de 3 lecturas del port (sin método nuevo):
   *     - obtenerSaldosHasta(desde−1)  → saldo INICIAL del patrimonio
   *     - obtenerSaldosHasta(hasta)    → saldo FINAL del patrimonio
   *     - obtenerSaldosEnRango(desde,hasta) → movimiento del período + resultado
   *     + obtenerEstructuraCuentas.
   *  3. Construir la matriz con evolucion-patrimonio.ts (función pura).
   *  4. Mapear a EvolucionPatrimonioResponseDto.
   *
   * @param tenantId - organizationId del JWT activo (CLAUDE.md §4.2)
   */
  async consultarEvolucionPatrimonio(
    tenantId: string,
    query: {
      fechaDesde?: string;
      fechaHasta?: string;
      periodoFiscalId?: string;
      gestionId?: string;
      incluirAnulados?: boolean;
    },
  ): Promise<EvolucionPatrimonioResponseDto> {
    const incluirAnulados = query.incluirAnulados ?? false;

    // ── 1. Resolver rango (prioridad: fechas > periodo > gestion) ────────────
    let desde: Date;
    let hasta: Date;

    if (query.fechaDesde !== undefined || query.fechaHasta !== undefined) {
      const desdeParsed = query.fechaDesde ? parseFechaContable(query.fechaDesde) : null;
      const hastaParsed = query.fechaHasta ? parseFechaContable(query.fechaHasta) : null;

      if (!desdeParsed || !hastaParsed || desdeParsed > hastaParsed) {
        throw new RangoInvalidoError();
      }

      desde = desdeParsed;
      hasta = hastaParsed;
    } else if (query.periodoFiscalId !== undefined) {
      const rango = await this.periodosReader.obtenerRangoFechas(tenantId, query.periodoFiscalId);
      if (!rango) {
        throw new PeriodoNoEncontradoError();
      }
      desde = rango.desde;
      hasta = rango.hasta;
    } else if (query.gestionId !== undefined) {
      const rango = await this.periodosReader.obtenerRangoGestion(tenantId, query.gestionId);
      if (!rango) {
        throw new GestionNoEncontradaError();
      }
      desde = rango.desde;
      hasta = rango.hasta;
    } else {
      throw new RangoInvalidoError();
    }

    // ── 2. Lecturas en paralelo (cero método nuevo de port) ──────────────────
    // El saldo inicial corta en el día PREVIO al inicio para que
    // saldoInicial + movimiento(rango) = saldoFinal (sin hueco ni solape).
    const [saldosInicial, saldosFinal, saldosRango, estructura] = await Promise.all([
      this.eeffSaldosReader.obtenerSaldosHasta(tenantId, {
        fechaCorte: diaAnterior(desde),
        incluirAnulados,
      }),
      this.eeffSaldosReader.obtenerSaldosHasta(tenantId, {
        fechaCorte: hasta,
        incluirAnulados,
      }),
      this.eeffSaldosReader.obtenerSaldosEnRango(tenantId, desde, hasta, incluirAnulados),
      this.eeffSaldosReader.obtenerEstructuraCuentas(tenantId),
    ]);

    // ── 3. Construir la matriz con función pura ──────────────────────────────
    const result = construirEvolucionPatrimonio({
      estructura,
      saldosInicial,
      saldosFinal,
      saldosRango,
    });

    // ── 4. Mapear a DTO ──────────────────────────────────────────────────────
    return toEvolucionPatrimonioResponse(result, { desde, hasta });
  }
}
