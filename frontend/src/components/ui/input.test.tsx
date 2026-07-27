import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Input } from './input';

/**
 * Red DÉBIL: jsdom no aplica Tailwind — esto prueba que la clase llega al DOM,
 * no que gane la cascada (`docs/claude/verificacion-frontend.md` §4). El
 * layout real se verificó en navegador. Lo que caza: que el piso táctil se
 * borre del primitivo sin que nadie lo note.
 */

// Nombres ARMADOS para que el escáner de Tailwind no levante el literal del
// test y regenere la utility en producción (§4.1 del doc de verificación).
const PISO_TACTIL = ['pointer-coarse', ['min-h', '11'].join('-')].join(':');

function clasesDe(className?: string): string[] {
  render(
    <Input
      aria-label="Buscar"
      {...(className !== undefined ? { className } : {})}
    />,
  );
  return screen.getByRole('textbox').className.split(/\s+/);
}

describe('Input — piso táctil de 44px (pointer: coarse)', () => {
  it('lleva el piso de alto', () => {
    expect(clasesDe()).toContain(PISO_TACTIL);
  });

  it('el piso sobrevive al merge con un alto del llamador', () => {
    // tailwind-merge solo colapsa clases del MISMO grupo y MISMO prefijo de
    // variante: un h-* o min-h-* sin prefijo no debe comerse el piso táctil.
    render(<Input aria-label="Chico" className={['h', '8'].join('-')} />);
    expect(screen.getByRole('textbox').className.split(/\s+/)).toContain(
      PISO_TACTIL,
    );
  });
});
