import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Switch } from './switch';

/**
 * Red DÉBIL: jsdom no aplica Tailwind — esto prueba que la clase llega al DOM,
 * no que gane la cascada ni cuánto mide el ::after
 * (`docs/claude/verificacion-frontend.md` §4). El área táctil real (44×44) se
 * verificó por hit-testing en navegador (`pnpm run medir:tap --tactil`). Lo
 * que caza este archivo: que el piso táctil se borre del primitivo, que el
 * root pierda el `relative` que ancla el ::after (sin él los insets se
 * resuelven contra otro ancestro y el área queda en cualquier lado), o que
 * vuelva la convención vieja por breakpoint.
 */

// Armados para que el escáner de Tailwind no levante los literales del test y
// regenere las utilities en producción (§4.1 del doc de verificación).
const enCoarseAfter = (utility: string) =>
  ['pointer-coarse', 'after', utility].join(':');
const INSET_X_TACTIL = ['-inset-x', '[7px]'].join('-');
const INSET_Y_TACTIL = ['-inset-y', '3.5'].join('-');

function clases(): string[] {
  render(<Switch aria-label="Incluir anulados" />);
  return screen.getByRole('switch').className.split(/\s+/);
}

describe('Switch — piso táctil de 44×44 (pointer: coarse)', () => {
  it('extiende el hit-area con un ::after bajo dedo', () => {
    const c = clases();
    expect(c).toContain(enCoarseAfter('absolute'));
    expect(c).toContain(enCoarseAfter(INSET_X_TACTIL));
    expect(c).toContain(enCoarseAfter(INSET_Y_TACTIL));
  });

  it('el root es relative: el ancla del ::after', () => {
    expect(clases()).toContain('relative');
  });

  it('no reintroduce el piso por breakpoint (convención vieja)', () => {
    expect(clases().filter((c) => /^md:(min-h|h|py|p)-/.test(c))).toHaveLength(
      0,
    );
  });
});
