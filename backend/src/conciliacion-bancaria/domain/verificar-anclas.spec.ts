import { FechaContable } from '@/common/domain/fecha-contable';
import { Money } from '@/common/domain/money';

import { verificarAnclas } from './verificar-anclas';
import type { LineaContableActual, SnapshotAncla } from './verificar-anclas';

function snapshot(overrides: Partial<SnapshotAncla> = {}): SnapshotAncla {
  return {
    cuentaId: 'cuenta-X',
    monto: Money.of('100.00'),
    tipo: 'DEBITO',
    moneda: 'BOB',
    fecha: FechaContable.fromIso('2026-06-10'),
    ...overrides,
  };
}

function lineaActual(overrides: Partial<LineaContableActual> = {}): LineaContableActual {
  return {
    cuentaId: 'cuenta-X',
    monto: Money.of('100.00'),
    tipo: 'DEBITO',
    moneda: 'BOB',
    fecha: FechaContable.fromIso('2026-06-10'),
    anulado: false,
    ...overrides,
  };
}

// REQ-CB-10 — función pura, NO ejecuta ninguna escritura.
describe('verificarAnclas (REQ-CB-10, design §2)', () => {
  it('línea intacta — vínculo válido', () => {
    const resultado = verificarAnclas(snapshot(), lineaActual());
    expect(resultado.valido).toBe(true);
    expect(resultado.motivo).toBeNull();
  });

  it('caso benigno — orden corrido pero el snapshot coincide en los 5 campos → válido', () => {
    // El caller resolvió (comprobanteId, orden) contra OTRA línea física tras
    // una edición que corrió el orden, pero esa línea tiene, por coincidencia
    // (2 depósitos del mismo monto a la misma cuenta banco), exactamente los
    // mismos 5 valores del snapshot. Es económicamente equivalente.
    const resultado = verificarAnclas(
      snapshot({ monto: Money.of('100.00'), cuentaId: 'cuenta-X' }),
      lineaActual({ monto: Money.of('100.00'), cuentaId: 'cuenta-X' }),
    );
    expect(resultado.valido).toBe(true);
    expect(resultado.motivo).toBeNull();
  });

  it('línea inexistente — el caller pasa null (ancla no resuelve)', () => {
    const resultado = verificarAnclas(snapshot(), null);
    expect(resultado.valido).toBe(false);
    expect(resultado.motivo).toBe('LINEA_INEXISTENTE');
  });

  it('comprobante anulado — vínculo roto aunque el resto coincida', () => {
    const resultado = verificarAnclas(snapshot(), lineaActual({ anulado: true }));
    expect(resultado.valido).toBe(false);
    expect(resultado.motivo).toBe('COMPROBANTE_ANULADO');
  });

  it('monto cambiado — usa Money.igualaConTolerancia, pero una diferencia real rompe el vínculo', () => {
    const resultado = verificarAnclas(
      snapshot({ monto: Money.of('100.00') }),
      lineaActual({ monto: Money.of('150.00') }),
    );
    expect(resultado.valido).toBe(false);
    expect(resultado.motivo).toBe('MONTO_CAMBIADO');
  });

  it('monto dentro de tolerancia ±0.01 NO rompe el vínculo (mismo mecanismo que el resto del dominio)', () => {
    const resultado = verificarAnclas(
      snapshot({ monto: Money.of('100.00') }),
      lineaActual({ monto: Money.of('100.01') }),
    );
    expect(resultado.valido).toBe(true);
  });

  it('lado contable invertido (DEBITO↔CREDITO) — vínculo roto', () => {
    const resultado = verificarAnclas(
      snapshot({ tipo: 'DEBITO' }),
      lineaActual({ tipo: 'CREDITO' }),
    );
    expect(resultado.valido).toBe(false);
    expect(resultado.motivo).toBe('LADO_CAMBIADO');
  });

  it('cuenta cambiada — la línea se reasignó a otra cuenta del plan', () => {
    const resultado = verificarAnclas(
      snapshot({ cuentaId: 'cuenta-X' }),
      lineaActual({ cuentaId: 'cuenta-Y' }),
    );
    expect(resultado.valido).toBe(false);
    expect(resultado.motivo).toBe('CUENTA_CAMBIADA');
  });

  it('moneda cambiada — vínculo roto', () => {
    const resultado = verificarAnclas(snapshot({ moneda: 'BOB' }), lineaActual({ moneda: 'USD' }));
    expect(resultado.valido).toBe(false);
    expect(resultado.motivo).toBe('MONEDA_CAMBIADA');
  });

  it('fecha cambiada — la fechaContable se movió de período', () => {
    const resultado = verificarAnclas(
      snapshot({ fecha: FechaContable.fromIso('2026-06-10') }),
      lineaActual({ fecha: FechaContable.fromIso('2026-07-01') }),
    );
    expect(resultado.valido).toBe(false);
    expect(resultado.motivo).toBe('FECHA_CAMBIADA');
  });

  it('es una función pura — no expone ningún efecto observable más allá de su valor de retorno', () => {
    const s = snapshot();
    const l = lineaActual();
    const resultado1 = verificarAnclas(s, l);
    const resultado2 = verificarAnclas(s, l);
    expect(resultado1).toEqual(resultado2);
  });
});
