import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Button } from './button';

/**
 * Red DÉBIL y hay que decirlo acá: jsdom no aplica Tailwind, así que esto
 * prueba qué clases llegan al DOM, no cuál gana ni cuánto mide nada
 * (`docs/claude/verificacion-frontend.md` §4). La cascada y los píxeles se
 * verificaron en navegador real: `min-height` computa como máximo contra el
 * `height` del size (44 > 36), y `pointer-coarse:min-h-11` sale después de
 * cualquier `min-h-*` sin variante en el CSS generado.
 *
 * Lo que SÍ caza este archivo: que alguien saque el piso táctil del cva y el
 * borrado pase callado — ningún otro test ni el gate de UI (que corre sin
 * emulación táctil por default) lo notaría.
 */

// Los nombres se ARMAN en vez de escribirse literales: Tailwind escanea los
// tests como fuente y un literal regeneraría la utility en el CSS de
// producción (§4.1 del doc de verificación).
const enCoarse = (utility: string) => ['pointer-coarse', utility].join(':');
const MIN_H_TACTIL = ['min-h', '11'].join('-');
const MIN_W_TACTIL = ['min-w', '11'].join('-');

type Size = React.ComponentProps<typeof Button>['size'];

function clasesDe(size?: Size, asChild = false): string[] {
  render(
    <Button {...(size !== undefined ? { size } : {})} asChild={asChild}>
      {asChild ? <a href="/x">Guardar</a> : 'Guardar'}
    </Button>,
  );
  const rol = asChild ? 'link' : 'button';
  return screen.getByRole(rol).className.split(/\s+/);
}

const SIZES: NonNullable<Size>[] = [
  'default',
  'xs',
  'sm',
  'lg',
  'icon',
  'icon-xs',
  'icon-sm',
  'icon-lg',
];

const SIZES_ICON: NonNullable<Size>[] = ['icon', 'icon-xs', 'icon-sm', 'icon-lg'];

describe('Button — piso táctil de 44px (pointer: coarse)', () => {
  it.each(SIZES)('el size %s lleva el piso de alto', (size) => {
    expect(clasesDe(size)).toContain(enCoarse(MIN_H_TACTIL));
  });

  it.each(SIZES_ICON)('el size %s lleva además el piso de ancho', (size) => {
    expect(clasesDe(size)).toContain(enCoarse(MIN_W_TACTIL));
  });

  it('con asChild el piso viaja igual, aunque un trigger de Radix pise data-slot', () => {
    // La firma confiable del primitivo es su className, no data-slot: un
    // PopoverTrigger asChild lo reescribe a "popover-trigger". Si el piso
    // dependiera de un selector [data-slot=button], esos botones quedarían
    // afuera — medido: 4 popover-triggers violaban el piso antes del fix.
    const clases = clasesDe('icon', true);
    expect(clases).toContain(enCoarse(MIN_H_TACTIL));
    expect(clases).toContain(enCoarse(MIN_W_TACTIL));
  });

  it('el piso sobrevive al merge con un min-h del llamador', () => {
    // Call sites de granja pasan min-h propios sin prefijo; tailwind-merge
    // solo colapsa clases del MISMO grupo y MISMO prefijo de variante.
    render(<Button className={['min-h', '10'].join('-')}>Guardar</Button>);
    expect(screen.getByRole('button').className.split(/\s+/)).toContain(
      enCoarse(MIN_H_TACTIL),
    );
  });
});
