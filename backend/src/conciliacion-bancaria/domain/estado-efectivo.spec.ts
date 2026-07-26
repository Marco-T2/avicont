import {
  derivarEstadoEfectivoLinea,
  derivarEstadoEfectivoMovimiento,
  esVinculoValido,
  type VinculoResuelto,
} from './estado-efectivo';

const VALIDO: VinculoResuelto = { roto: null };
const ROTO: VinculoResuelto = { roto: 'MONTO_CAMBIADO' };

describe('esVinculoValido', () => {
  it('sin vínculo → false', () => {
    expect(esVinculoValido(null)).toBe(false);
  });

  it('vínculo con motivo de rotura → false', () => {
    expect(esVinculoValido(ROTO)).toBe(false);
  });

  it('vínculo sin motivo de rotura → true', () => {
    expect(esVinculoValido(VALIDO)).toBe(true);
  });
});

describe('derivarEstadoEfectivoMovimiento (REQ-CB-10/11)', () => {
  it('vínculo VÁLIDO manda sobre la columna persistida → CONCILIADO', () => {
    expect(derivarEstadoEfectivoMovimiento('PENDIENTE', VALIDO)).toBe('CONCILIADO');
    expect(derivarEstadoEfectivoMovimiento('CONCILIADO', VALIDO)).toBe('CONCILIADO');
    expect(derivarEstadoEfectivoMovimiento('IGNORADO', VALIDO)).toBe('CONCILIADO');
  });

  it('vínculo ROTO con columna CONCILIADO → vuelve a PENDIENTE (la columna NO es la verdad de display)', () => {
    expect(derivarEstadoEfectivoMovimiento('CONCILIADO', ROTO)).toBe('PENDIENTE');
  });

  it('vínculo ROTO con columna IGNORADO → IGNORADO se respeta', () => {
    expect(derivarEstadoEfectivoMovimiento('IGNORADO', ROTO)).toBe('IGNORADO');
  });

  it('vínculo ROTO con columna PENDIENTE → PENDIENTE', () => {
    expect(derivarEstadoEfectivoMovimiento('PENDIENTE', ROTO)).toBe('PENDIENTE');
  });

  it('sin vínculo: columna CONCILIADO huérfana → PENDIENTE', () => {
    expect(derivarEstadoEfectivoMovimiento('CONCILIADO', null)).toBe('PENDIENTE');
  });

  it('sin vínculo: IGNORADO → IGNORADO', () => {
    expect(derivarEstadoEfectivoMovimiento('IGNORADO', null)).toBe('IGNORADO');
  });

  it('sin vínculo: PENDIENTE → PENDIENTE', () => {
    expect(derivarEstadoEfectivoMovimiento('PENDIENTE', null)).toBe('PENDIENTE');
  });
});

describe('derivarEstadoEfectivoLinea (REQ-CB-11)', () => {
  it('reclamada por un vínculo VÁLIDO → CONCILIADO', () => {
    expect(derivarEstadoEfectivoLinea(true)).toBe('CONCILIADO');
  });

  it('sin vínculo válido que la reclame → EN_TRANSITO (estado DERIVADO, nunca persistido)', () => {
    expect(derivarEstadoEfectivoLinea(false)).toBe('EN_TRANSITO');
  });
});
