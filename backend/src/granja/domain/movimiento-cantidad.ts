import { FechaContable } from '@/common/domain/fecha-contable';
import { NaturalezaRegistro } from './enums';
import {
  MovimientoCantidadInvalidaError,
  TipoRegistroNaturalezaInvalidaError,
} from './granja-errors';

const DETALLE_MAX = 500;

export interface MovimientoCantidadCrearParams {
  /** Entero > 0. Representa aves que se restan del lote (mortalidad u otro). */
  cantidad: number;
  tipoRegistroId: string;
  /** Naturaleza del tipo de registro referenciado — debe ser CANTIDAD. */
  naturalezaTipoRegistro: NaturalezaRegistro;
  /** Texto libre, máximo 500 caracteres. Null si no se proporciona. */
  detalle: string | null;
  fecha: FechaContable;
  loteId: string;
  organizationId: string;
}

/**
 * Entidad de dominio para movimientos de cantidad (mortalidad u otras bajas
 * de aves del lote).
 *
 * Invariantes en la entidad:
 *   - cantidad: entero > 0.
 *   - naturalezaTipoRegistro === CANTIDAD (ruteo correcto).
 *   - detalle: null o ≤ 500 caracteres.
 *
 * Invariante DELEGADO al service (P6):
 *   - avesVivas ≥ 0 — es AGREGADO multi-fila, vive en el service bajo SELECT
 *     FOR UPDATE (S4). El service calcula avesVivas = cantidadInicial − Σmuertes
 *     dentro de la transacción antes de persistir.
 */
export class MovimientoCantidad {
  readonly cantidad: number;
  readonly tipoRegistroId: string;
  readonly detalle: string | null;
  readonly fecha: FechaContable;
  readonly loteId: string;
  readonly organizationId: string;

  private constructor(params: MovimientoCantidadCrearParams) {
    this.cantidad = params.cantidad;
    this.tipoRegistroId = params.tipoRegistroId;
    this.detalle = params.detalle;
    this.fecha = params.fecha;
    this.loteId = params.loteId;
    this.organizationId = params.organizationId;
  }

  static crear(params: MovimientoCantidadCrearParams): MovimientoCantidad {
    if (!Number.isInteger(params.cantidad) || params.cantidad <= 0) {
      throw new MovimientoCantidadInvalidaError(params.cantidad);
    }

    if (params.naturalezaTipoRegistro !== NaturalezaRegistro.CANTIDAD) {
      throw new TipoRegistroNaturalezaInvalidaError(
        params.tipoRegistroId,
        NaturalezaRegistro.CANTIDAD,
        params.naturalezaTipoRegistro,
      );
    }

    if (params.detalle !== null && params.detalle.length > DETALLE_MAX) {
      throw new RangeError(
        `MovimientoCantidad: detalle excede ${DETALLE_MAX} caracteres (${params.detalle.length})`,
      );
    }

    return new MovimientoCantidad(params);
  }
}
