import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import {
  CUENTAS_READER_LOOKUP_PORT,
  CuentasReaderLookupPort,
} from '@/cuentas/ports/cuentas-reader-lookup.port';
import {
  PERIODOS_READER_PORT,
  PeriodosReaderPort,
} from '@/periodos-fiscales/ports/periodos-reader.port';

import {
  CuentaNoDetalleError,
  CuentaNoEncontradaError,
  FiltroRequeridoError,
  PeriodoNoEncontradoError,
  RangoExcedeLimiteError,
  RangoInvalidoError,
} from './domain/libro-diario-errors';
import { toLibroDiarioResponse } from './dto/libro-diario-response.dto';
import type { LibroDiarioResponseDto } from './dto/libro-diario-response.dto';
import { COMPROBANTES_READER_PORT, ComprobantesReaderPort } from './ports/comprobantes-reader.port';
import { parseFechaContable } from './fecha-contable';

/** Nombre de la variable de entorno para el tope de asientos (REQ-LD-10). */
export const LIBRO_DIARIO_MAX_ASIENTOS_ENV = 'LIBRO_DIARIO_MAX_ASIENTOS';

/** Tope defensivo por defecto cuando la env no está configurada. */
export const LIBRO_DIARIO_MAX_ASIENTOS_DEFAULT = 5_000;

@Injectable()
export class LibroDiarioService {
  private readonly maxAsientos: number;

  constructor(
    @Inject(COMPROBANTES_READER_PORT)
    private readonly comprobantesReader: ComprobantesReaderPort,
    @Inject(PERIODOS_READER_PORT)
    private readonly periodosReader: PeriodosReaderPort,
    @Inject(CUENTAS_READER_LOOKUP_PORT)
    private readonly cuentasReader: CuentasReaderLookupPort,
    private readonly config: ConfigService,
  ) {
    // REQ-LD-10: umbral configurable via env LIBRO_DIARIO_MAX_ASIENTOS (default 5000).
    // Permite reducirlo en tests sin modificar lógica.
    this.maxAsientos = this.config.get<number>(
      LIBRO_DIARIO_MAX_ASIENTOS_ENV,
      LIBRO_DIARIO_MAX_ASIENTOS_DEFAULT,
    );
  }

  /**
   * Consulta el Libro Diario para el tenant activo.
   *
   * Orquesta:
   *  1. Validación de filtros (DomainError si inválido)
   *  2. Resolución período → rango de fechas (si periodoFiscalId)
   *  3. Tope defensivo por count previo (REQ-LD-10)
   *  4. Consulta al adapter y mapeo al DTO de respuesta
   *
   * @param tenantId - organizationId del JWT activo (CLAUDE.md §4.2)
   * @param query    - Parámetros de la query (del DTO del controller)
   */
  async consultarLibroDiario(
    tenantId: string,
    query: {
      periodoFiscalId?: string;
      fechaDesde?: string;
      fechaHasta?: string;
      incluirAnulados: boolean;
      cuentaId?: string;
    },
  ): Promise<LibroDiarioResponseDto> {
    // ── 1. Validación de forma (design decisión #6) ───────────────────────
    const tienePeriodo = query.periodoFiscalId !== undefined && query.periodoFiscalId !== '';
    const tieneDesde = query.fechaDesde !== undefined && query.fechaDesde !== '';
    const tieneHasta = query.fechaHasta !== undefined && query.fechaHasta !== '';
    const tieneRango = tieneDesde && tieneHasta;
    const tieneRangoParcial = (tieneDesde && !tieneHasta) || (!tieneDesde && tieneHasta);

    // REQ-LD-01: exactamente uno de período O rango
    if (tienePeriodo && tieneRango) throw new FiltroRequeridoError();
    if (tienePeriodo && tieneRangoParcial) throw new FiltroRequeridoError();
    if (!tienePeriodo && !tieneRango) throw new FiltroRequeridoError();

    // ── 2. Resolución rango de fechas ─────────────────────────────────────
    let fechaDesde: Date;
    let fechaHasta: Date;

    if (tienePeriodo) {
      // Resolver periodoFiscalId → rango via PeriodosReaderPort (design decisión #4)
      const rangoResu = await this.periodosReader.obtenerRangoFechas(
        tenantId,
        query.periodoFiscalId!,
      );
      if (!rangoResu) {
        throw new PeriodoNoEncontradoError(query.periodoFiscalId!);
      }
      fechaDesde = rangoResu.desde;
      fechaHasta = rangoResu.hasta;
    } else {
      // Parsear fechas string YYYY-MM-DD a Date UTC (FechaContable §4.6).
      // parseFechaContable devuelve null ante fechas calendario imposibles
      // (ej. 2026-02-30, que el @Matches del DTO deja pasar por solo validar forma).
      const desdeParsed = parseFechaContable(query.fechaDesde!);
      const hastaParsed = parseFechaContable(query.fechaHasta!);
      if (!desdeParsed || !hastaParsed) {
        throw new RangoInvalidoError(query.fechaDesde!, query.fechaHasta!);
      }
      fechaDesde = desdeParsed;
      fechaHasta = hastaParsed;

      // REQ-LD-01: fechaDesde ≤ fechaHasta
      if (fechaDesde > fechaHasta) {
        throw new RangoInvalidoError(query.fechaDesde!, query.fechaHasta!);
      }
    }

    // ── 2.5. Validación de cuenta (REQ-LD-12..14) ───────────────────────────
    if (query.cuentaId !== undefined) {
      const cuenta = await this.cuentasReader.obtenerCuentaDetalle(tenantId, query.cuentaId);
      if (cuenta === null) throw new CuentaNoEncontradaError(query.cuentaId);
      // Código de Comercio art. 36: solo cuentas de detalle tienen movimientos directos.
      if (!cuenta.esDetalle) throw new CuentaNoDetalleError(query.cuentaId);
    }

    const filtros = {
      fechaDesde,
      fechaHasta,
      incluirAnulados: query.incluirAnulados,
      ...(query.cuentaId !== undefined ? { cuentaId: query.cuentaId } : {}),
    };

    // ── 3. Tope defensivo por count previo (design decisión #5, REQ-LD-10) ─
    const cantidad = await this.comprobantesReader.contarAsientos(tenantId, filtros);
    if (cantidad > this.maxAsientos) {
      throw new RangoExcedeLimiteError(cantidad, this.maxAsientos);
    }

    // ── 4. Consulta y mapeo ───────────────────────────────────────────────
    const rows = await this.comprobantesReader.obtenerAsientosParaLibroDiario(tenantId, filtros);
    return toLibroDiarioResponse(rows, { desde: fechaDesde, hasta: fechaHasta });
  }
}
