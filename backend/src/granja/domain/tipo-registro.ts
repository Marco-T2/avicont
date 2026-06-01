import { NaturalezaRegistro } from './enums';

export interface TipoRegistroCrearParams {
  nombre: string;
  /** Inmutable una vez creado. */
  naturaleza: NaturalezaRegistro;
  /** true = sembrado por el sistema (fábrica); false = definido por el usuario. */
  esSistema: boolean;
  organizationId: string;
}

/**
 * Entidad de dominio para tipos de registro del módulo Granja.
 *
 * Invariantes en la entidad:
 *   - naturaleza: INMUTABLE post-creación (readonly).
 *   - esSistema: los tipos de sistema no son editables en nombre ni naturaleza,
 *     y no son eliminables (guardas `esEditable()` / `esEliminable()`).
 *
 * Reglas delegadas al service (requieren contexto externo):
 *   - Unicidad de nombre por (organizationId, nombre) → service pre-valida + UNIQUE BD.
 *   - No eliminar si tiene movimientos asociados → service chequea count antes.
 */
export class TipoRegistro {
  readonly nombre: string;

  /** Inmutable: asignada al crear, nunca reasignada. */
  readonly naturaleza: NaturalezaRegistro;

  readonly esSistema: boolean;

  readonly organizationId: string;

  private _activo: boolean;

  private constructor(params: TipoRegistroCrearParams) {
    this.nombre = params.nombre;
    this.naturaleza = params.naturaleza;
    this.esSistema = params.esSistema;
    this.organizationId = params.organizationId;
    this._activo = true;
  }

  static crear(params: TipoRegistroCrearParams): TipoRegistro {
    return new TipoRegistro(params);
  }

  /**
   * Reconstituye desde persistencia. No re-valida — el dato ya fue validado
   * al crearse. Solo restaura el estado actual (activo).
   */
  static reconstituir(params: {
    nombre: string;
    naturaleza: NaturalezaRegistro;
    esSistema: boolean;
    organizationId: string;
    activo: boolean;
  }): TipoRegistro {
    const tipo = new TipoRegistro({
      nombre: params.nombre,
      naturaleza: params.naturaleza,
      esSistema: params.esSistema,
      organizationId: params.organizationId,
    });
    tipo._activo = params.activo;
    return tipo;
  }

  get activo(): boolean {
    return this._activo;
  }

  /**
   * true si nombre y naturaleza pueden editarse.
   * Los tipos de sistema (esSistema = true) protegen nombre y naturaleza.
   * El flag `activo` es editable para todos (activar/desactivar).
   */
  esEditable(): boolean {
    return !this.esSistema;
  }

  /**
   * true si el tipo puede eliminarse físicamente.
   * Los tipos de sistema son permanentes.
   * La regla de "tiene movimientos" es externa (requiere consulta al repo) y
   * vive en el service.
   */
  esEliminable(): boolean {
    return !this.esSistema;
  }
}
