import { FechaContable } from '@/common/domain/fecha-contable';
import { Money } from '@/common/domain/money';
import { InvalidStateError, ValidationError } from '@/common/errors';
import { NaturalezaRegistro } from './enums';
import { MovimientoInversion } from './movimiento-inversion';

const fecha = FechaContable.of(2026, 1, 15);

function inversionFabrica(
  overrides?: Partial<Parameters<typeof MovimientoInversion.crear>[0]>,
): MovimientoInversion {
  return MovimientoInversion.crear({
    monto: Money.of('1500.00'),
    tipoRegistroId: 'tipo-1',
    naturalezaTipoRegistro: NaturalezaRegistro.INVERSION,
    detalle: 'Compra de pollitos',
    fecha,
    loteId: 'lote-1',
    organizationId: 'org-1',
    ...overrides,
  });
}

describe('MovimientoInversion.crear', () => {
  it('crea una inversión válida', () => {
    const mov = inversionFabrica();

    expect(mov.monto.toBob()).toBe('1500.00');
    expect(mov.tipoRegistroId).toBe('tipo-1');
    expect(mov.detalle).toBe('Compra de pollitos');
    expect(mov.fecha.toIso()).toBe('2026-01-15');
    expect(mov.loteId).toBe('lote-1');
    expect(mov.organizationId).toBe('org-1');
  });

  it('acepta detalle null (campo opcional)', () => {
    const mov = inversionFabrica({ detalle: null });
    expect(mov.detalle).toBeNull();
  });

  it('acepta detalle exactamente 500 caracteres (máximo)', () => {
    const mov = inversionFabrica({ detalle: 'A'.repeat(500) });
    expect(mov.detalle).toBe('A'.repeat(500));
  });

  it('rechaza monto = 0', () => {
    expect(() => inversionFabrica({ monto: Money.of('0') })).toThrow(ValidationError);
  });

  it('rechaza monto negativo', () => {
    expect(() => inversionFabrica({ monto: Money.of('-100') })).toThrow(ValidationError);
  });

  it('rechaza naturaleza CANTIDAD (debe ser INVERSION)', () => {
    expect(() => inversionFabrica({ naturalezaTipoRegistro: NaturalezaRegistro.CANTIDAD })).toThrow(
      InvalidStateError,
    );
  });

  it('rechaza detalle mayor a 500 caracteres', () => {
    expect(() => inversionFabrica({ detalle: 'A'.repeat(501) })).toThrow(RangeError);
  });
});
