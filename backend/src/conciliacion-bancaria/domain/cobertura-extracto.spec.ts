import { FechaContable } from '@/common/domain/fecha-contable';

import { detectarHuecos } from './cobertura-extracto';
import type { RangoCobertura } from './cobertura-extracto';

function rango(desde: string, hasta: string): RangoCobertura {
  return { desde: FechaContable.fromIso(desde), hasta: FechaContable.fromIso(hasta) };
}

// REQ-CB-09 — capacidad de dominio DIFERIDA sin endpoint en v1 (proposal.md
// la deja explícitamente fuera de alcance). Requisito normativo sobre la
// FUNCIÓN, no sobre un endpoint HTTP.
describe('detectarHuecos (REQ-CB-09, dominio puro)', () => {
  it('dos rangos dejan un hueco entre ellos', () => {
    const huecos = detectarHuecos([
      rango('2026-06-01', '2026-06-10'),
      rango('2026-06-20', '2026-06-30'),
    ]);
    expect(huecos).toEqual([rango('2026-06-11', '2026-06-19')]);
  });

  it('rangos contiguos (sin días sueltos entre ellos) — sin huecos', () => {
    const huecos = detectarHuecos([
      rango('2026-06-01', '2026-06-10'),
      rango('2026-06-11', '2026-06-20'),
    ]);
    expect(huecos).toEqual([]);
  });

  it('rangos solapados — sin huecos', () => {
    const huecos = detectarHuecos([
      rango('2026-06-01', '2026-06-15'),
      rango('2026-06-10', '2026-06-20'),
    ]);
    expect(huecos).toEqual([]);
  });

  it('funciona independientemente del orden de entrada de los rangos', () => {
    const enOrden = detectarHuecos([
      rango('2026-06-01', '2026-06-10'),
      rango('2026-06-20', '2026-06-30'),
    ]);
    const invertido = detectarHuecos([
      rango('2026-06-20', '2026-06-30'),
      rango('2026-06-01', '2026-06-10'),
    ]);
    expect(invertido).toEqual(enOrden);
  });

  it('tres rangos con dos huecos distintos', () => {
    const huecos = detectarHuecos([
      rango('2026-06-01', '2026-06-05'),
      rango('2026-06-10', '2026-06-15'),
      rango('2026-06-20', '2026-06-25'),
    ]);
    expect(huecos).toEqual([rango('2026-06-06', '2026-06-09'), rango('2026-06-16', '2026-06-19')]);
  });

  it('un solo rango — sin huecos', () => {
    expect(detectarHuecos([rango('2026-06-01', '2026-06-10')])).toEqual([]);
  });

  it('lista vacía — sin huecos', () => {
    expect(detectarHuecos([])).toEqual([]);
  });

  it('hueco de un solo día se reporta como rango de un día', () => {
    const huecos = detectarHuecos([
      rango('2026-06-01', '2026-06-10'),
      rango('2026-06-12', '2026-06-20'),
    ]);
    expect(huecos).toEqual([rango('2026-06-11', '2026-06-11')]);
  });

  it('rango totalmente contenido en otro — sin huecos', () => {
    const huecos = detectarHuecos([
      rango('2026-06-01', '2026-06-30'),
      rango('2026-06-10', '2026-06-15'),
    ]);
    expect(huecos).toEqual([]);
  });
});
