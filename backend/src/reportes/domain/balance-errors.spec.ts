import { FechaCorteInvalidaError, GestionNoEncontradaError } from './balance-errors';

// ============================================================
// Tests: errores de dominio del Balance General
// REQ-BG-01, REQ-BG-02
// ============================================================

describe('FechaCorteInvalidaError', () => {
  it('tiene HTTP 400 y code REPORTES_BALANCE_FECHA_INVALIDA', () => {
    const error = new FechaCorteInvalidaError();

    expect(error.httpStatus).toBe(400);
    expect(error.code).toBe('REPORTES_BALANCE_FECHA_INVALIDA');
  });

  it('tiene mensaje en español', () => {
    const error = new FechaCorteInvalidaError();

    expect(error.message).toContain('YYYY-MM-DD');
  });
});

describe('GestionNoEncontradaError', () => {
  it('tiene HTTP 422 y code REPORTES_BALANCE_SIN_GESTION', () => {
    const error = new GestionNoEncontradaError('2026-05-31');

    expect(error.httpStatus).toBe(422);
    expect(error.code).toBe('REPORTES_BALANCE_SIN_GESTION');
  });

  it('incluye la fecha en details', () => {
    const error = new GestionNoEncontradaError('2026-05-31');

    expect(error.details).toEqual({ fecha: '2026-05-31' });
  });

  it('tiene mensaje en español', () => {
    const error = new GestionNoEncontradaError('2026-05-31');

    expect(error.message).toContain('gestión fiscal');
  });
});
