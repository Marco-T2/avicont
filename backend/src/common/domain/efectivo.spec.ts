import { CODIGO_EFECTIVO_PREFIJO, esEfectivoPorCodigo } from './efectivo';

describe('esEfectivoPorCodigo', () => {
  const cuenta = (codigoInterno: string, esDetalle = true) => ({ codigoInterno, esDetalle });

  it('reconoce una cuenta de detalle bajo el prefijo de efectivo', () => {
    expect(esEfectivoPorCodigo(cuenta('1.1.1.001'))).toBe(true);
    expect(esEfectivoPorCodigo(cuenta('1.1.1.002'))).toBe(true);
  });

  it('rechaza una cuenta fuera del prefijo', () => {
    expect(esEfectivoPorCodigo(cuenta('1.1.2.001'))).toBe(false);
    expect(esEfectivoPorCodigo(cuenta('4.1.1.001'))).toBe(false);
  });

  it('rechaza la agrupadora aunque su código sea el prefijo', () => {
    // §4.1: sólo cuentas `esDetalle` reciben movimiento.
    expect(esEfectivoPorCodigo(cuenta('1.1.1', false))).toBe(false);
    expect(esEfectivoPorCodigo(cuenta('1.1.1.001', false))).toBe(false);
  });

  it('acepta el prefijo exacto si fuera una cuenta de detalle', () => {
    expect(esEfectivoPorCodigo(cuenta(CODIGO_EFECTIVO_PREFIJO))).toBe(true);
  });

  // ── La razón por la que este helper no usa `startsWith` a secas ──────────
  //
  // El plan de cuentas es EDITABLE por el usuario (`/plan-cuentas`). Hoy `1.1`
  // llega hasta `1.1.6`, pero nada impide crear `1.1.10`, y entonces
  // `'1.1.10.001'.startsWith('1.1.1')` es `true`: una cuenta que no tiene nada
  // que ver quedaría clasificada como efectivo.
  //
  // En el EFE eso sería una línea mal ubicada en un reporte. En Ventas es peor:
  // el mismo predicado decide qué cuenta puede recibir un cobro, así que la
  // cuenta equivocada pasaría a ser un destino de plata válido.
  //
  // La comparación es por SEGMENTO: o el código es el prefijo exacto, o
  // continúa con un punto.
  it('NO confunde un hermano cuyo código empieza igual (1.1.10 vs 1.1.1)', () => {
    expect(esEfectivoPorCodigo(cuenta('1.1.10.001'))).toBe(false);
    expect(esEfectivoPorCodigo(cuenta('1.1.11'))).toBe(false);
    expect(esEfectivoPorCodigo(cuenta('1.1.1X'))).toBe(false);
  });
});
