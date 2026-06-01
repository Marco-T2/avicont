import { FechaContable } from '@/common/domain/fecha-contable';
import { Money } from '@/common/domain/money';
import { NaturalezaRegistro } from './enums';
import {
  MovimientoInversionMontoInvalidoError,
  TipoRegistroNaturalezaInvalidaError,
} from './granja-errors';

const DETALLE_MAX = 500;

export interface MovimientoInversionCrearParams {
  monto: Money;
  tipoRegistroId: string;
  /** Naturaleza del tipo de registro referenciado — debe ser INVERSION. */
  naturalezaTipoRegistro: NaturalezaRegistro;
  /** Texto libre, máximo 500 caracteres. Null si no se proporciona. */
  detalle: string | null;
  fecha: FechaContable;
  loteId: string;
  organizationId: string;
}

/**
 * Entidad de dominio para movimientos de inversión (gastos del lote):
 * compra de pollitos, alimento, vacunas, mano de obra, etc.
 *
 * Invariantes en la entidad:
 *   - monto > 0 (Money).
 *   - naturalezaTipoRegistro === INVERSION (ruteo correcto).
 *   - detalle: null o ≤ 500 caracteres.
 *
 * Invariante delegado al service:
 *   - El lote debe estar ACTIVO (lote.admiteMovimientos()) — el service verifica
 *     antes de persistir (LoteCerradoError).
 */
export class MovimientoInversion {
  readonly monto: Money;
  readonly tipoRegistroId: string;
  readonly detalle: string | null;
  readonly fecha: FechaContable;
  readonly loteId: string;
  readonly organizationId: string;

  private constructor(params: MovimientoInversionCrearParams) {
    this.monto = params.monto;
    this.tipoRegistroId = params.tipoRegistroId;
    this.detalle = params.detalle;
    this.fecha = params.fecha;
    this.loteId = params.loteId;
    this.organizationId = params.organizationId;
  }

  static crear(params: MovimientoInversionCrearParams): MovimientoInversion {
    if (!params.monto.isPositive()) {
      throw new MovimientoInversionMontoInvalidoError();
    }

    if (params.naturalezaTipoRegistro !== NaturalezaRegistro.INVERSION) {
      throw new TipoRegistroNaturalezaInvalidaError(
        params.tipoRegistroId,
        NaturalezaRegistro.INVERSION,
        params.naturalezaTipoRegistro,
      );
    }

    if (params.detalle !== null && params.detalle.length > DETALLE_MAX) {
      throw new RangeError(
        `MovimientoInversion: detalle excede ${DETALLE_MAX} caracteres (${params.detalle.length})`,
      );
    }

    return new MovimientoInversion(params);
  }
}
