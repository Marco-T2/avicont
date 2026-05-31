import {
  RangoInvalidoError,
  PeriodoNoEncontradoError,
  GestionNoEncontradaError,
} from './resultados-errors';

// ============================================================
// Tests: errores de dominio del Estado de Resultados
// NCB art. 36: el Estado de Resultados debe estar acotado a un período válido.
// REQ-ER-01
// ============================================================

describe('RangoInvalidoError', () => {
  it('tiene HTTP 400 y code REPORTES_RESULTADOS_RANGO_INVALIDO', () => {
    const error = new RangoInvalidoError();

    expect(error.httpStatus).toBe(400);
    expect(error.code).toBe('REPORTES_RESULTADOS_RANGO_INVALIDO');
  });

  it('tiene mensaje en español sobre el rango', () => {
    const error = new RangoInvalidoError();

    expect(error.message).toContain('rango');
  });

  it('es instancia de ValidationError (400)', () => {
    const error = new RangoInvalidoError();

    expect(error.httpStatus).toBe(400);
  });
});

describe('PeriodoNoEncontradoError', () => {
  it('tiene HTTP 422 y code REPORTES_RESULTADOS_SIN_PERIODO', () => {
    const error = new PeriodoNoEncontradoError();

    expect(error.httpStatus).toBe(422);
    expect(error.code).toBe('REPORTES_RESULTADOS_SIN_PERIODO');
  });

  it('tiene mensaje en español sobre el período', () => {
    const error = new PeriodoNoEncontradoError();

    expect(error.message).toContain('período');
  });

  it('es instancia de InvalidStateError (422)', () => {
    const error = new PeriodoNoEncontradoError();

    expect(error.httpStatus).toBe(422);
  });
});

describe('GestionNoEncontradaError (resultados)', () => {
  it('tiene HTTP 422 y code REPORTES_RESULTADOS_SIN_GESTION', () => {
    const error = new GestionNoEncontradaError();

    expect(error.httpStatus).toBe(422);
    expect(error.code).toBe('REPORTES_RESULTADOS_SIN_GESTION');
  });

  it('tiene mensaje en español sobre la gestión', () => {
    const error = new GestionNoEncontradaError();

    expect(error.message).toContain('gestión');
  });

  it('es instancia de InvalidStateError (422)', () => {
    const error = new GestionNoEncontradaError();

    expect(error.httpStatus).toBe(422);
  });
});
