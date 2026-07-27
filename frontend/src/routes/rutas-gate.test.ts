// Guard anti-drift del gate de UI.
//
// `scripts/rutas-gate.mjs` lista a mano las pantallas que el gate visita, porque
// el gate corre en Node sin bundler y no puede importar TSX. El riesgo de una
// lista a mano es que se quede vieja: se agrega una pantalla, nadie la suma, y
// el gate sigue en verde sin haberla mirado nunca. Un gate que se cree completo
// sin serlo es peor que no tenerlo, porque nadie vuelve a revisar la cobertura.
//
// Por eso el chequeo es BIDIRECCIONAL: toda ruta estática del router está
// cubierta o excluida CON MOTIVO, y toda ruta listada existe de verdad.

import { describe, expect, it } from 'vitest';

import { RUTAS_EXCLUIDAS, RUTAS_GATE, VIEWPORTS } from '../../scripts/rutas-gate.mjs';

import { router } from './router';

interface NodoRuta {
  readonly path?: string;
  readonly children?: readonly NodoRuta[];
}

function recolectarPaths(nodos: readonly NodoRuta[]): string[] {
  return nodos.flatMap((nodo) => [
    ...(nodo.path === undefined ? [] : [nodo.path]),
    ...(nodo.children === undefined ? [] : recolectarPaths(nodo.children)),
  ]);
}

// Las rutas con parámetro necesitarían un id real de la BD del seed; el gate
// trabaja sobre pantallas alcanzables por URL fija.
const esEstatica = (p: string): boolean => !p.includes(':') && p !== '*';

const PATHS_DEL_ROUTER = recolectarPaths(router.routes as readonly NodoRuta[]).filter(esEstatica);

describe('cobertura del gate de UI', () => {
  it('el router expone rutas estáticas (si no, el resto de los tests no probaría nada)', () => {
    expect(PATHS_DEL_ROUTER.length).toBeGreaterThan(20);
  });

  it('toda ruta estática del router está cubierta por el gate o excluida con motivo', () => {
    const cubiertas = new Set([...RUTAS_GATE, ...Object.keys(RUTAS_EXCLUIDAS)]);
    const huerfanas = PATHS_DEL_ROUTER.filter((p) => !cubiertas.has(p));

    expect(
      huerfanas,
      `Rutas nuevas sin decisión de cobertura: ${huerfanas.join(', ')}. ` +
        'Sumalas a RUTAS_GATE, o a RUTAS_EXCLUIDAS explicando por qué el gate no puede verlas.',
    ).toEqual([]);
  });

  it('toda ruta listada en el gate existe en el router', () => {
    const delRouter = new Set(PATHS_DEL_ROUTER);
    const fantasmas = RUTAS_GATE.filter((p) => !delRouter.has(p));

    expect(
      fantasmas,
      `El gate visitaría rutas que ya no existen: ${fantasmas.join(', ')}.`,
    ).toEqual([]);
  });

  it('toda exclusión corresponde a una ruta real y trae motivo no vacío', () => {
    const delRouter = new Set(PATHS_DEL_ROUTER);

    for (const [ruta, motivo] of Object.entries(RUTAS_EXCLUIDAS)) {
      expect(delRouter.has(ruta), `La exclusión ${ruta} no corresponde a ninguna ruta`).toBe(true);
      expect(motivo.length, `La exclusión ${ruta} no explica por qué`).toBeGreaterThan(20);
    }
  });

  it('ninguna ruta está a la vez cubierta y excluida', () => {
    const ambas = RUTAS_GATE.filter((p) => p in RUTAS_EXCLUIDAS);

    expect(ambas, `Contradicción: ${ambas.join(', ')}`).toEqual([]);
  });

  it('mide los dos viewports del checklist §7 donde el layout cambia', () => {
    expect(VIEWPORTS).toEqual([375, 768]);
  });
});
