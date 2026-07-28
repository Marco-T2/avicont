import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Checkbox } from './checkbox';

/**
 * Red DÉBIL: jsdom no aplica Tailwind — esto prueba que la clase llega al DOM,
 * no que gane la cascada ni cuánto mide el ::after
 * (`docs/claude/verificacion-frontend.md` §4). El área táctil real (44×44) se
 * verificó por hit-testing en navegador (`pnpm run medir:tap --tactil`), que
 * es lo único que ve pseudo-elementos. Lo que caza este archivo: que el piso
 * táctil se borre del primitivo sin que nadie lo note, o que vuelva la
 * convención vieja por breakpoint.
 */

// Los nombres se ARMAN en vez de escribirse literales: Tailwind escanea los
// tests como fuente y un literal regeneraría la utility en el CSS de
// producción (§4.1 del doc de verificación). Ojo: hasta el fragmento
// `-inset-x-[15px]` solo es una utility válida SIN prefijo — también se arma.
const enCoarseAfter = (utility: string) =>
  ['pointer-coarse', 'after', utility].join(':');
const INSET_X_TACTIL = ['-inset-x', '[15px]'].join('-');
const INSET_Y_TACTIL = ['-inset-y', '[15px]'].join('-');

function clases(): string[] {
  render(<Checkbox aria-label="Activo" />);
  return screen.getByRole('checkbox').className.split(/\s+/);
}

describe('Checkbox — piso táctil de 44×44 (pointer: coarse)', () => {
  it('extiende el ::after a 15px por lado bajo dedo', () => {
    const c = clases();
    expect(c).toContain(enCoarseAfter(INSET_X_TACTIL));
    expect(c).toContain(enCoarseAfter(INSET_Y_TACTIL));
  });

  it('conserva el ::after chico para mouse (la extensión es solo coarse)', () => {
    // Pinnea el default fino: sin esto, el gemelo de arriba pasa igual si
    // alguien vuelve la extensión incondicional y agranda el hit-area de
    // escritorio en silencio.
    const c = clases();
    expect(c).toContain(['after', ['-inset-x', '3'].join('-')].join(':'));
    expect(c).toContain(['after', ['-inset-y', '2'].join('-')].join(':'));
  });

  it('no reintroduce el piso por breakpoint (convención vieja)', () => {
    expect(clases().filter((c) => /^md:(min-h|h|py|p)-/.test(c))).toHaveLength(
      0,
    );
  });
});
