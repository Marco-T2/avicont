import { FechaContable } from '@/common/domain/fecha-contable';
import { InvalidStateError, ValidationError } from '@/common/errors';
import { NaturalezaRegistro } from './enums';
import { MovimientoCantidad } from './movimiento-cantidad';

const fecha = FechaContable.of(2026, 2, 1);

function cantidadFabrica(
  overrides?: Partial<Parameters<typeof MovimientoCantidad.crear>[0]>,
): MovimientoCantidad {
  return MovimientoCantidad.crear({
    cantidad: 5,
    tipoRegistroId: 'tipo-mortalidad',
    naturalezaTipoRegistro: NaturalezaRegistro.CANTIDAD,
    detalle: 'Muerte por Newcastle',
    fecha,
    loteId: 'lote-1',
    organizationId: 'org-1',
    ...overrides,
  });
}

describe('MovimientoCantidad.crear', () => {
  it('crea un movimiento de cantidad válido', () => {
    const mov = cantidadFabrica();

    expect(mov.cantidad).toBe(5);
    expect(mov.tipoRegistroId).toBe('tipo-mortalidad');
    expect(mov.detalle).toBe('Muerte por Newcastle');
    expect(mov.fecha.toIso()).toBe('2026-02-01');
    expect(mov.loteId).toBe('lote-1');
    expect(mov.organizationId).toBe('org-1');
  });

  it('acepta cantidad = 1 (mínimo válido)', () => {
    const mov = cantidadFabrica({ cantidad: 1 });
    expect(mov.cantidad).toBe(1);
  });

  it('acepta detalle null (campo opcional)', () => {
    const mov = cantidadFabrica({ detalle: null });
    expect(mov.detalle).toBeNull();
  });

  it('acepta detalle exactamente 500 caracteres (máximo)', () => {
    const mov = cantidadFabrica({ detalle: 'B'.repeat(500) });
    expect(mov.detalle).toBe('B'.repeat(500));
  });

  it('rechaza cantidad = 0', () => {
    expect(() => cantidadFabrica({ cantidad: 0 })).toThrow(ValidationError);
  });

  it('rechaza cantidad negativa', () => {
    expect(() => cantidadFabrica({ cantidad: -1 })).toThrow(ValidationError);
  });

  it('rechaza cantidad no entera', () => {
    expect(() => cantidadFabrica({ cantidad: 2.5 })).toThrow(ValidationError);
  });

  it('rechaza naturaleza INVERSION (debe ser CANTIDAD)', () => {
    expect(() => cantidadFabrica({ naturalezaTipoRegistro: NaturalezaRegistro.INVERSION })).toThrow(
      InvalidStateError,
    );
  });

  it('rechaza detalle mayor a 500 caracteres', () => {
    expect(() => cantidadFabrica({ detalle: 'C'.repeat(501) })).toThrow(RangeError);
  });
});

describe('MovimientoCantidad — avesVivas >= 0 es invariante del service', () => {
  it('crea movimiento de cantidad grande sin chequear avesVivas (lo hace el service con FOR UPDATE)', () => {
    // Este test documenta explícitamente que el invariante avesVivas>=0
    // es AGREGADO y vive en el service (S4), no en esta entidad.
    const mov = cantidadFabrica({ cantidad: 9999 });
    expect(mov.cantidad).toBe(9999);
  });
});
