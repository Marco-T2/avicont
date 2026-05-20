import {
  ConflictError,
  ForbiddenError,
  InvalidStateError,
  NotFoundError,
  ValidationError,
} from '@/common/errors';

// ============================================================
// Gestiones
// ============================================================

export class GestionNoEncontradaError extends NotFoundError {
  constructor(id: string) {
    super('GESTION_NO_ENCONTRADA', 'La gestión fiscal no existe', { id });
  }
}

export class GestionDuplicadaError extends ConflictError {
  constructor(organizationId: string, year: number) {
    super('GESTION_DUPLICADA', `Ya existe una gestión fiscal para el año ${year}`, {
      organizationId,
      year,
    });
  }
}

export class GestionYearFueraDeRangoError extends InvalidStateError {
  constructor(year: number, min: number, max: number) {
    super('GESTION_YEAR_FUERA_DE_RANGO', `El año fiscal debe estar entre ${min} y ${max}`, {
      year,
      min,
      max,
    });
  }
}

export class GestionYaCerradaError extends ConflictError {
  constructor(id: string) {
    super('GESTION_YA_CERRADA', 'La gestión fiscal ya está cerrada', { id });
  }
}

export class GestionConPeriodosAbiertosError extends InvalidStateError {
  constructor(id: string, periodosAbiertos: Array<{ year: number; month: number; orden: number }>) {
    super(
      'GESTION_CON_PERIODOS_ABIERTOS',
      'No se puede cerrar la gestión: hay períodos todavía abiertos',
      { id, periodosAbiertos },
    );
  }
}

export class TenantSinTipoEmpresaError extends InvalidStateError {
  constructor(tenantId: string) {
    super('TENANT_SIN_TIPO_EMPRESA', 'La organización no tiene tipo de empresa definido', {
      tenantId,
    });
  }
}

// ============================================================
// Períodos
// ============================================================

export class PeriodoNoEncontradoError extends NotFoundError {
  constructor(id: string) {
    super('PERIODO_NO_ENCONTRADO', 'El período fiscal no existe', { id });
  }
}

export class PeriodoCerradoError extends ConflictError {
  constructor(id: string) {
    super('PERIODO_CERRADO', 'El período fiscal ya está cerrado', { id });
  }
}

export class PeriodoConBorradoresError extends InvalidStateError {
  constructor(id: string, cantidadBorradores: number) {
    super(
      'PERIODO_CON_BORRADORES',
      `No se puede cerrar el período: hay ${cantidadBorradores} comprobante(s) en borrador pendientes`,
      { id, cantidadBorradores },
    );
  }
}

export class PeriodoYaAbiertoError extends ConflictError {
  constructor(id: string) {
    super('PERIODO_YA_ABIERTO', 'El período ya está abierto', { id });
  }
}

export class PeriodoDefinitivoNoReabribleError extends ConflictError {
  constructor(id: string) {
    super(
      'PERIODO_DEFINITIVO_NO_REABRIBLE',
      'El período fue marcado como definitivo y no puede reabrirse',
      { id },
    );
  }
}

export class PeriodoNoCerradoError extends InvalidStateError {
  constructor(id: string) {
    super(
      'PERIODO_NO_CERRADO',
      'Solo se puede marcar como definitivo un período que ya esté cerrado',
      { id },
    );
  }
}

export class MotivoReaperturaInvalidoError extends ValidationError {
  constructor() {
    super(
      'MOTIVO_REAPERTURA_INVALIDO',
      'El motivo de reapertura debe tener al menos 20 caracteres',
    );
  }
}

export class SoloOwnerAdminPuedeReabrirError extends ForbiddenError {
  constructor() {
    super('SOLO_OWNER_ADMIN_PUEDE_REABRIR', 'Solo OWNER o ADMIN pueden reabrir períodos');
  }
}

export class SoloOwnerPuedeMarcarDefinitivoError extends ForbiddenError {
  constructor() {
    super(
      'SOLO_OWNER_PUEDE_MARCAR_DEFINITIVO',
      'Solo OWNER puede marcar períodos como definitivos',
    );
  }
}
