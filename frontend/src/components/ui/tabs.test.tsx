import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Tabs, TabsList, TabsTrigger } from './tabs';

/**
 * Red DÉBIL: jsdom no aplica Tailwind — esto prueba que la clase llega al DOM,
 * no que gane la cascada ni cuánto mide el ::before
 * (`docs/claude/verificacion-frontend.md` §4). El área táctil real (≥44 de
 * alto) se verificó por hit-testing en navegador (`pnpm run medir:tap
 * --tactil`). Lo que caza este archivo: que el piso táctil se borre del
 * trigger, que alguien lo mude al ::after —que ya está OCUPADO por el
 * indicador de la variante line y lo pisaría—, o que vuelva la convención
 * vieja por breakpoint.
 */

// Armados para que el escáner de Tailwind no levante los literales del test y
// regenere las utilities en producción (§4.1 del doc de verificación).
const enCoarseBefore = (utility: string) =>
  ['pointer-coarse', 'before', utility].join(':');
const INSET_Y_TACTIL = ['-inset-y', '[9px]'].join('-');
const INSET_X_CERO = ['inset-x', '0'].join('-');
const INDICADOR_LINE = ['after', ['bg', 'foreground'].join('-')].join(':');
const PREFIJO_COARSE_AFTER = ['pointer-coarse', 'after', ''].join(':');

function clasesTrigger(): string[] {
  render(
    <Tabs value="a">
      <TabsList>
        <TabsTrigger value="a">Lista</TabsTrigger>
        <TabsTrigger value="b">Árbol</TabsTrigger>
      </TabsList>
    </Tabs>,
  );
  return screen.getByRole('tab', { name: 'Lista' }).className.split(/\s+/);
}

describe('TabsTrigger — piso táctil de 44px de alto (pointer: coarse)', () => {
  it('extiende el hit-area con un ::before bajo dedo, solo en vertical', () => {
    const c = clasesTrigger();
    expect(c).toContain(enCoarseBefore('absolute'));
    expect(c).toContain(enCoarseBefore(INSET_Y_TACTIL));
    // inset-x en 0 y no negativo: expandir a los costados robaría click al
    // trigger vecino (los triggers son contiguos dentro del TabsList).
    expect(c).toContain(enCoarseBefore(INSET_X_CERO));
  });

  it('la extensión táctil no usa el ::after, que es del indicador line', () => {
    // Pinnea el indicador para que el gemelo negativo no pase "porque el
    // ::after desapareció entero" (lección §4.2 del doc de verificación).
    const c = clasesTrigger();
    expect(c).toContain(INDICADOR_LINE);
    expect(c.filter((cl) => cl.startsWith(PREFIJO_COARSE_AFTER))).toHaveLength(
      0,
    );
  });

  it('no reintroduce el piso por breakpoint (convención vieja)', () => {
    expect(
      clasesTrigger().filter((c) => /^md:(min-h|h|py|p)-/.test(c)),
    ).toHaveLength(0);
  });
});
