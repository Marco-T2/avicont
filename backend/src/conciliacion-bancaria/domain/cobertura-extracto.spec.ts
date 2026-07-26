import { FechaContable } from '@/common/domain/fecha-contable';

import { detectarHuecos, detectarHuecosDeBorde } from './cobertura-extracto';
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

  it('NO ve los bordes: cobertura que empieza tarde y termina temprano no da ningún hueco', () => {
    // La ceguera que motiva `detectarHuecosDeBorde`. Sin ventana contra la cual
    // comparar, un único rango no tiene contra qué ser un hueco.
    expect(detectarHuecos([rango('2026-07-10', '2026-07-20')])).toEqual([]);
  });
});

// La ventana del informe es `arranque.fecha + 1 día` … `corte` (REQ-ICB-01):
// lo anterior al arranque ya está absorbido en los saldos declarados.
describe('detectarHuecosDeBorde (ceguera de bordes, §3.7)', () => {
  const ventana = rango('2026-07-01', '2026-07-31');

  it('cobertura que arranca después del inicio de la ventana → hueco inicial', () => {
    const bordes = detectarHuecosDeBorde([rango('2026-07-10', '2026-07-31')], ventana);
    expect(bordes.inicial).toEqual(rango('2026-07-01', '2026-07-09'));
    expect(bordes.final).toBeNull();
  });

  it('cobertura que termina antes del corte → hueco final', () => {
    const bordes = detectarHuecosDeBorde([rango('2026-07-01', '2026-07-25')], ventana);
    expect(bordes.inicial).toBeNull();
    expect(bordes.final).toEqual(rango('2026-07-26', '2026-07-31'));
  });

  it('cobertura corta en el medio → los DOS bordes', () => {
    const bordes = detectarHuecosDeBorde([rango('2026-07-10', '2026-07-20')], ventana);
    expect(bordes.inicial).toEqual(rango('2026-07-01', '2026-07-09'));
    expect(bordes.final).toEqual(rango('2026-07-21', '2026-07-31'));
  });

  it('cobertura exacta de la ventana → sin bordes', () => {
    const bordes = detectarHuecosDeBorde([rango('2026-07-01', '2026-07-31')], ventana);
    expect(bordes).toEqual({ inicial: null, final: null });
  });

  it('cobertura que desborda la ventana por ambos lados → sin bordes', () => {
    const bordes = detectarHuecosDeBorde([rango('2026-06-01', '2026-08-31')], ventana);
    expect(bordes).toEqual({ inicial: null, final: null });
  });

  it('ninguna importación toca la ventana → UN solo hueco, nombrado inicial', () => {
    // Son el mismo tramo: emitirlo como inicial Y final sería reportar dos
    // problemas donde hay uno.
    const bordes = detectarHuecosDeBorde([rango('2026-05-01', '2026-05-31')], ventana);
    expect(bordes.inicial).toEqual(ventana);
    expect(bordes.final).toBeNull();
  });

  it('sin ninguna importación → la ventana entera es hueco inicial', () => {
    const bordes = detectarHuecosDeBorde([], ventana);
    expect(bordes.inicial).toEqual(ventana);
    expect(bordes.final).toBeNull();
  });

  it('una importación ANTERIOR que se estira dentro de la ventana cubre el inicio', () => {
    const bordes = detectarHuecosDeBorde([rango('2026-06-15', '2026-07-31')], ventana);
    expect(bordes).toEqual({ inicial: null, final: null });
  });

  it('el fin cubierto es el MÁXIMO hasta, no el del rango que empieza último', () => {
    // Un extracto viejo y largo puede cubrir más lejos que uno reciente y corto:
    // tomar el `hasta` del último en empezar inventaría un hueco final falso.
    const bordes = detectarHuecosDeBorde(
      [rango('2026-07-01', '2026-07-31'), rango('2026-07-20', '2026-07-22')],
      ventana,
    );
    expect(bordes.final).toBeNull();
  });

  it('ignora la cobertura que queda entera fuera de la ventana', () => {
    const bordes = detectarHuecosDeBorde(
      [rango('2026-05-01', '2026-05-31'), rango('2026-07-05', '2026-07-31')],
      ventana,
    );
    expect(bordes.inicial).toEqual(rango('2026-07-01', '2026-07-04'));
    expect(bordes.final).toBeNull();
  });

  it('hueco de borde de un solo día se reporta como rango de un día', () => {
    const bordes = detectarHuecosDeBorde([rango('2026-07-02', '2026-07-30')], ventana);
    expect(bordes.inicial).toEqual(rango('2026-07-01', '2026-07-01'));
    expect(bordes.final).toEqual(rango('2026-07-31', '2026-07-31'));
  });

  it('ventana vacía (arranque declarado el día del corte) → sin bordes', () => {
    const bordes = detectarHuecosDeBorde([], rango('2026-08-01', '2026-07-31'));
    expect(bordes).toEqual({ inicial: null, final: null });
  });

  it('los huecos del MEDIO no son asunto de esta función', () => {
    // Los cubre `detectarHuecos`; acá los extremos están cubiertos y con eso alcanza.
    const bordes = detectarHuecosDeBorde(
      [rango('2026-07-01', '2026-07-10'), rango('2026-07-20', '2026-07-31')],
      ventana,
    );
    expect(bordes).toEqual({ inicial: null, final: null });
  });
});
