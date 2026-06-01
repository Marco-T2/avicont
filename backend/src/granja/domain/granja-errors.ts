/**
 * Errores de dominio del módulo Granja. Subclases de DomainError que el
 * GlobalExceptionFilter mapea al formato estándar (CLAUDE.md §6.4).
 *
 * Códigos ESTABLES hacia el cliente — no cambian aunque el message evolucione
 * (CLAUDE.md §6.3).
 */

import { ConflictError, InvalidStateError, NotFoundError, ValidationError } from '@/common/errors';

// ============================================================
// 404 — recurso no encontrado (o de otra org → mismo tratamiento)
// ============================================================

export class LoteNoEncontradoError extends NotFoundError {
  constructor(id: string) {
    super('GRANJA_LOTE_NO_ENCONTRADO', 'El lote no existe o no pertenece a la organización', {
      id,
    });
  }
}

export class TipoRegistroNoEncontradoError extends NotFoundError {
  constructor(id: string) {
    super(
      'GRANJA_TIPO_REGISTRO_NO_ENCONTRADO',
      'El tipo de registro no existe o no pertenece a la organización',
      { id },
    );
  }
}

export class MovimientoNoEncontradoError extends NotFoundError {
  constructor(id: string) {
    super(
      'GRANJA_MOVIMIENTO_NO_ENCONTRADO',
      'El movimiento no existe o no pertenece a la organización',
      { id },
    );
  }
}

// ============================================================
// 400 — validación de input
// ============================================================

export class LoteCantidadInicialInvalidaError extends ValidationError {
  constructor(cantidad: number) {
    super(
      'GRANJA_LOTE_CANTIDAD_INICIAL_INVALIDA',
      'La cantidad inicial del lote debe ser un entero mayor a cero',
      { cantidad },
    );
  }
}

export class MovimientoInversionMontoInvalidoError extends ValidationError {
  constructor() {
    super(
      'GRANJA_MOVIMIENTO_INVERSION_MONTO_INVALIDO',
      'El monto de la inversión debe ser mayor a cero',
    );
  }
}

export class MovimientoCantidadInvalidaError extends ValidationError {
  constructor(cantidad: number) {
    super(
      'GRANJA_MOVIMIENTO_CANTIDAD_INVALIDA',
      'La cantidad de mortalidad debe ser un entero mayor a cero',
      { cantidad },
    );
  }
}

// ============================================================
// 409 — conflictos de unicidad
// ============================================================

export class TipoRegistroNombreDuplicadoError extends ConflictError {
  constructor(nombre: string) {
    super(
      'GRANJA_TIPO_REGISTRO_NOMBRE_DUPLICADO',
      `Ya existe un tipo de registro con el nombre '${nombre}' en esta organización`,
      { nombre },
    );
  }
}

export class TipoRegistroSistemaNoEliminableError extends ConflictError {
  constructor(id: string) {
    super(
      'GRANJA_TIPO_REGISTRO_SISTEMA_NO_ELIMINABLE',
      'Los tipos de registro del sistema no pueden eliminarse',
      { id },
    );
  }
}

export class TipoRegistroEnUsoError extends ConflictError {
  constructor(id: string) {
    super(
      'GRANJA_TIPO_REGISTRO_EN_USO',
      'El tipo de registro tiene movimientos asociados y no puede eliminarse',
      { id },
    );
  }
}

// ============================================================
// 422 — estado inválido para la operación solicitada
// ============================================================

export class LoteYaCerradoError extends InvalidStateError {
  constructor(id: string) {
    super('GRANJA_LOTE_YA_CERRADO', 'El lote ya fue cerrado', { id });
  }
}

/** Intento de registrar movimiento o editar un lote en estado CERRADO. */
export class LoteCerradoError extends InvalidStateError {
  constructor(id: string) {
    super('GRANJA_LOTE_CERRADO', 'El lote está cerrado y no admite movimientos ni ediciones', {
      id,
    });
  }
}

/** Intento de modificar cantidadInicial post-creación. */
export class LoteCantidadInicialInmutableError extends InvalidStateError {
  constructor(id: string) {
    super(
      'GRANJA_LOTE_CANTIDAD_INICIAL_INMUTABLE',
      'La cantidad inicial del lote no puede modificarse una vez creado',
      { id },
    );
  }
}

/** El tipo de registro no tiene la naturaleza esperada para la operación. */
export class TipoRegistroNaturalezaInvalidaError extends InvalidStateError {
  constructor(id: string, naturalezaEsperada: string, naturalezaReal: string) {
    super(
      'GRANJA_TIPO_REGISTRO_NATURALEZA_INVALIDA',
      `El tipo de registro tiene naturaleza '${naturalezaReal}', se esperaba '${naturalezaEsperada}'`,
      { id, naturalezaEsperada, naturalezaReal },
    );
  }
}

/** El tipo de registro está inactivo y no puede usarse. */
export class TipoRegistroInactivoError extends InvalidStateError {
  constructor(id: string) {
    super(
      'GRANJA_TIPO_REGISTRO_INACTIVO',
      'El tipo de registro está inactivo y no puede usarse en nuevos movimientos',
      { id },
    );
  }
}

/** El tipo de registro del sistema no es editable (nombre/naturaleza protegidos). */
export class TipoRegistroSistemaNoEditableError extends InvalidStateError {
  constructor(id: string) {
    super(
      'GRANJA_TIPO_REGISTRO_SISTEMA_NO_EDITABLE',
      'Los tipos de registro del sistema no pueden renombrarse ni cambiar naturaleza',
      { id },
    );
  }
}

/** Naturaleza intentada cambiar post-creación. */
export class TipoRegistroNaturalezaInmutableError extends InvalidStateError {
  constructor(id: string) {
    super(
      'GRANJA_TIPO_REGISTRO_NATURALEZA_INMUTABLE',
      'La naturaleza de un tipo de registro no puede cambiarse una vez creado',
      { id },
    );
  }
}

/** Se intentó registrar más cantidad que aves vivas disponibles. */
export class MovimientoCantidadExcedeVivasError extends InvalidStateError {
  constructor(loteId: string) {
    super(
      'GRANJA_MOVIMIENTO_CANTIDAD_EXCEDE_VIVAS',
      'La cantidad de bajas excede las aves vivas del lote',
      { loteId },
    );
  }
}
