import { FechaContable } from '@/common/domain/fecha-contable';
import { ValidationError } from '@/common/errors';
import { EstadoLote } from './enums';
import { LoteYaCerradoError } from './granja-errors';
import { Lote } from './lote';

const fechaIngreso = FechaContable.of(2026, 1, 10);

function loteFabrica(overrides?: Partial<Parameters<typeof Lote.crear>[0]>): Lote {
  return Lote.crear({
    cantidadInicial: 500,
    fechaIngreso,
    galpon: 'Galpón A',
    organizationId: 'org-1',
    ...overrides,
  });
}

describe('Lote.crear', () => {
  it('crea un lote activo con datos válidos', () => {
    const lote = loteFabrica();

    expect(lote.cantidadInicial).toBe(500);
    expect(lote.estado).toBe(EstadoLote.ACTIVO);
    expect(lote.fechaIngreso.toIso()).toBe('2026-01-10');
    expect(lote.galpon).toBe('Galpón A');
    expect(lote.organizationId).toBe('org-1');
  });

  it('acepta galpón nulo (campo opcional)', () => {
    const lote = loteFabrica({ galpon: null });
    expect(lote.galpon).toBeNull();
  });

  it('acepta cantidadInicial = 1 (mínimo válido)', () => {
    const lote = loteFabrica({ cantidadInicial: 1 });
    expect(lote.cantidadInicial).toBe(1);
  });

  it('rechaza cantidadInicial = 0', () => {
    expect(() => loteFabrica({ cantidadInicial: 0 })).toThrow(ValidationError);
  });

  it('rechaza cantidadInicial negativa', () => {
    expect(() => loteFabrica({ cantidadInicial: -1 })).toThrow(ValidationError);
    expect(() => loteFabrica({ cantidadInicial: -100 })).toThrow(ValidationError);
  });

  it('rechaza cantidadInicial no entera', () => {
    expect(() => loteFabrica({ cantidadInicial: 10.5 })).toThrow(ValidationError);
  });
});

describe('Lote.cerrar', () => {
  it('cierra un lote activo cambiando estado a CERRADO', () => {
    const lote = loteFabrica();
    const fechaCierre = FechaContable.of(2026, 3, 15);

    lote.cerrar(fechaCierre);

    expect(lote.estado).toBe(EstadoLote.CERRADO);
    expect(lote.fechaCierre?.toIso()).toBe('2026-03-15');
  });

  it('rechaza cerrar un lote ya cerrado', () => {
    const lote = loteFabrica();
    const fechaCierre = FechaContable.of(2026, 3, 15);
    lote.cerrar(fechaCierre);

    expect(() => lote.cerrar(FechaContable.of(2026, 4, 1))).toThrow(LoteYaCerradoError);
  });
});

describe('Lote — admiteMovimientos', () => {
  it('lote activo admite movimientos', () => {
    const lote = loteFabrica();
    expect(lote.admiteMovimientos()).toBe(true);
  });

  it('lote cerrado no admite movimientos', () => {
    const lote = loteFabrica();
    lote.cerrar(FechaContable.of(2026, 3, 15));
    expect(lote.admiteMovimientos()).toBe(false);
  });
});

describe('Lote — cantidadInicial es INMUTABLE post-creación', () => {
  it('la propiedad cantidadInicial es readonly', () => {
    const lote = loteFabrica({ cantidadInicial: 300 });
    // TypeScript impide la asignación en tiempo de compilación;
    // verificamos que el valor no cambió.
    expect(lote.cantidadInicial).toBe(300);
  });
});
