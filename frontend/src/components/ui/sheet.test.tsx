import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Sheet, SheetContent, SheetTitle } from './sheet';

/**
 * El ancho del Sheet vivía en clases prefijadas por variante
 * (`data-[side=right]:w-3/4`). tailwind-merge no las reconoce como la misma
 * clave que el `w-full` del llamador, así que convivían las dos en el DOM y
 * en CSS ganaba el selector de atributo por especificidad: el ancho que
 * pedía cada pantalla quedaba INERTE, sin warning ni error.
 *
 * Se medió en navegador: el sheet de declarar arranque pedía `sm:max-w-xl`
 * (576px) y renderizaba 384px; a 375px renderizaba 281px pese al `w-full`.
 * Afectaba a las 16 pantallas de la app que declaran ancho — el 100%.
 *
 * Estos tests miran el className resultante, no píxeles: jsdom no aplica
 * Tailwind. Es una red débil, pero la clase de bug es exactamente "las dos
 * clases conviven y gana la que no querías", y eso sí se ve acá.
 */
function abrirSheet(className?: string, side: 'left' | 'right' | 'bottom' = 'right') {
  render(
    <Sheet open>
      <SheetContent side={side} {...(className !== undefined ? { className } : {})}>
        <SheetTitle>Título</SheetTitle>
      </SheetContent>
    </Sheet>,
  );
  return screen.getByRole('dialog').className.split(/\s+/);
}

describe('SheetContent — ancho', () => {
  it('deja ganar el ancho del llamador y descarta el default del primitivo', () => {
    const clases = abrirSheet('w-full sm:max-w-xl');

    expect(clases).toContain('w-full');
    expect(clases).toContain('sm:max-w-xl');
    // Lo que rompía todo: estas dos sobrevivían al merge y ganaban por
    // especificidad. Si vuelven a aparecer, el ancho del llamador es adorno.
    expect(clases).not.toContain('w-3/4');
    expect(clases).not.toContain('sm:max-w-sm');
    expect(clases).not.toContain('data-[side=right]:w-3/4');
    expect(clases).not.toContain('data-[side=right]:sm:max-w-sm');
  });

  it('conserva el ancho por defecto cuando el llamador no pide ninguno', () => {
    const clases = abrirSheet(undefined);

    expect(clases).toContain('w-3/4');
    expect(clases).toContain('sm:max-w-sm');
  });

  it('respeta un ancho fijo como el `w-64` de los drawers de navegación', () => {
    // mobile-sidebar y platform-shell piden `w-64`; antes del fix rendereaban
    // 281px (3/4 de 375) en vez de los 256px declarados.
    const clases = abrirSheet('w-64 p-0 bg-sidebar', 'left');

    expect(clases).toContain('w-64');
    expect(clases).not.toContain('w-3/4');
  });

  it('no le pone ancho a los sheets horizontales, que los estira `inset-x-0`', () => {
    const clases = abrirSheet(undefined, 'bottom');

    expect(clases).not.toContain('w-3/4');
    expect(clases).not.toContain('sm:max-w-sm');
  });
});
