import { Inject, Injectable } from '@nestjs/common';

import {
  PERIODOS_READER_PORT,
  PeriodosReaderPort,
} from '@/periodos-fiscales/ports/periodos-reader.port';

import { construirBalanceComprobacion } from './domain/balance-comprobacion';
import {
  PeriodoNoEncontradoError,
  RangoAmbiguoError,
  RangoInvalidoError,
  RangoRequeridoError,
} from './domain/balance-comprobacion-errors';
import { toBalanceComprobacionResponse } from './dto/balance-comprobacion-response.dto';
import type { BalanceComprobacionResponseDto } from './dto/balance-comprobacion-response.dto';
import { EEFF_SALDOS_READER_PORT, EeffSaldosReaderPort } from './ports/eeff-saldos-reader.port';
import { parseFechaContable } from './fecha-contable';

@Injectable()
export class BalanceComprobacionService {
  constructor(
    @Inject(EEFF_SALDOS_READER_PORT)
    private readonly eeffSaldosReader: EeffSaldosReaderPort,
    @Inject(PERIODOS_READER_PORT)
    private readonly periodosReader: PeriodosReaderPort,
  ) {}

  /**
   * Consulta el Balance de Comprobación de Sumas y Saldos para el tenant activo.
   *
   * Orquesta:
   *  1. Resolver el modo del rango (XOR `desde`/`hasta` vs `periodoFiscalId`) →
   *     errores DR-5 (RANGO_REQUERIDO / RANGO_AMBIGUO).
   *  2. Resolver `[desde, hasta]` (parseo directo o `obtenerRangoFechas`) →
   *     RANGO_INVALIDO / PERIODO_NO_ENCONTRADO.
   *  3. Promise.all([obtenerSaldosEnRango, obtenerEstructuraCuentas]). NUNCA
   *     `obtenerSaldosHasta` — el Balance de Comprobación es de flujo del rango (DR-3).
   *  4. Delegar construcción al builder puro `balance-comprobacion.ts`.
   *  5. Mapear a BalanceComprobacionResponseDto.
   *
   * @param tenantId - organizationId del JWT activo (CLAUDE.md §4.2)
   * @param query    - Parámetros de la consulta
   */
  async consultarBalanceComprobacion(
    tenantId: string,
    query: {
      desde?: string;
      hasta?: string;
      periodoFiscalId?: string;
      incluirAnulados: boolean;
    },
  ): Promise<BalanceComprobacionResponseDto> {
    const tieneRango = query.desde !== undefined || query.hasta !== undefined;
    const tienePeriodo = query.periodoFiscalId !== undefined;

    // ── 1. XOR de modos (REQ-BC-01) ───────────────────────────────────────
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
      // Modo rango: ambas fechas requeridas y coherentes (REQ-BC-02).
      const desdeParsed = query.desde ? parseFechaContable(query.desde) : null;
      const hastaParsed = query.hasta ? parseFechaContable(query.hasta) : null;

      if (!desdeParsed || !hastaParsed || desdeParsed > hastaParsed) {
        throw new RangoInvalidoError();
      }

      desde = desdeParsed;
      hasta = hastaParsed;
    } else {
      // Modo período (REQ-BC-01/02). El `!` es seguro: tienePeriodo === true aquí.
      const rango = await this.periodosReader.obtenerRangoFechas(tenantId, query.periodoFiscalId!);
      if (!rango) {
        throw new PeriodoNoEncontradoError();
      }
      desde = rango.desde;
      hasta = rango.hasta;
    }

    // ── 3. Saldos de flujo del rango + estructura, en paralelo ────────────
    // DR-3: SOLO obtenerSaldosEnRango — el Balance de Comprobación es de flujo
    // del rango, sin arrastre histórico (NUNCA obtenerSaldosHasta).
    // excluirCierre=true (§4.9 CLAUDE.md): balance de comprobación PRE-cierre. Sin esto,
    // una gestión cerrada mostraría ingresos/egresos en cero (el cierre los anula).
    const [saldosRango, estructura] = await Promise.all([
      this.eeffSaldosReader.obtenerSaldosEnRango(
        tenantId,
        desde,
        hasta,
        query.incluirAnulados,
        true,
      ),
      this.eeffSaldosReader.obtenerEstructuraCuentas(tenantId),
    ]);

    // ── 4. Construir con dominio puro ─────────────────────────────────────
    const result = construirBalanceComprobacion({ estructura, saldosRango });

    // ── 5. Mapear a DTO de respuesta ──────────────────────────────────────
    return toBalanceComprobacionResponse(result, { desde, hasta });
  }
}
