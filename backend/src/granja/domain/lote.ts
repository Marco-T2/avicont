import { FechaContable } from '@/common/domain/fecha-contable';
import { EstadoLote } from './enums';
import { LoteCantidadInicialInvalidaError, LoteYaCerradoError } from './granja-errors';

export interface LoteCrearParams {
  cantidadInicial: number;
  fechaIngreso: FechaContable;
  /** Texto libre, sin unicidad. Puede ser null si no aplica. */
  galpon: string | null;
  organizationId: string;
}

/**
 * Aggregate root del módulo Granja. Representa un lote de pollos parrilleros
 * desde su ingreso hasta el cierre (saca o descarte).
 *
 * Invariantes de dominio en esta entidad:
 *   - cantidadInicial > 0 y entero (validado al crear, INMUTABLE post-creación).
 *   - estado: ACTIVO → CERRADO, transición única e irreversible en v1.
 *   - Lote CERRADO no admite movimientos.
 *
 * El invariante avesVivas ≥ 0 es AGREGADO (requiere suma de movimientos) y
 * vive en el service con SELECT FOR UPDATE — no es responsabilidad de esta entidad.
 */
export class Lote {
  /** Inmutable: asignado al crear, nunca reasignado. */
  readonly cantidadInicial: number;

  readonly fechaIngreso: FechaContable;

  readonly galpon: string | null;

  readonly organizationId: string;

  private _estado: EstadoLote;

  private _fechaCierre: FechaContable | null = null;

  private constructor(params: LoteCrearParams) {
    this.cantidadInicial = params.cantidadInicial;
    this.fechaIngreso = params.fechaIngreso;
    this.galpon = params.galpon;
    this.organizationId = params.organizationId;
    this._estado = EstadoLote.ACTIVO;
  }

  static crear(params: LoteCrearParams): Lote {
    if (!Number.isInteger(params.cantidadInicial) || params.cantidadInicial <= 0) {
      throw new LoteCantidadInicialInvalidaError(params.cantidadInicial);
    }
    return new Lote(params);
  }

  /**
   * Reconstituye un lote desde persistencia. No re-valida invariantes de
   * creación — el dato ya fue validado al crearse. Solo restaura el estado.
   */
  static reconstituir(params: {
    cantidadInicial: number;
    fechaIngreso: FechaContable;
    galpon: string | null;
    organizationId: string;
    estado: EstadoLote;
    fechaCierre: FechaContable | null;
  }): Lote {
    const lote = new Lote({
      cantidadInicial: params.cantidadInicial,
      fechaIngreso: params.fechaIngreso,
      galpon: params.galpon,
      organizationId: params.organizationId,
    });
    lote._estado = params.estado;
    lote._fechaCierre = params.fechaCierre;
    return lote;
  }

  get estado(): EstadoLote {
    return this._estado;
  }

  get fechaCierre(): FechaContable | null {
    return this._fechaCierre;
  }

  /**
   * Cierra el lote. Transición ACTIVO → CERRADO, irreversible en v1.
   * @throws LoteYaCerradoError si el lote ya estaba cerrado.
   */
  cerrar(fechaCierre: FechaContable): void {
    if (this._estado === EstadoLote.CERRADO) {
      // El id no está disponible en la entidad pura; el service pasa el id
      // al llamar desde afuera. Usamos string vacío aquí — la excepción se
      // relanza con el id real desde el service si es necesario.
      throw new LoteYaCerradoError('');
    }
    this._estado = EstadoLote.CERRADO;
    this._fechaCierre = fechaCierre;
  }

  /**
   * true si el lote acepta nuevos movimientos (inversión o cantidad).
   * Un lote CERRADO es read-only para movimientos.
   */
  admiteMovimientos(): boolean {
    return this._estado === EstadoLote.ACTIVO;
  }
}
