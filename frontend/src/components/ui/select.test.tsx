import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Select, SelectTrigger, SelectValue } from './select';

/**
 * Tercera instancia de la familia "el primitivo anula en silencio lo que
 * declara el llamador" (las dos primeras, en `sheet.tsx`, se cerraron en el
 * PR #273).
 *
 * El default de shadcn ponía `line-clamp-1` y `flex` sobre el MISMO elemento
 * (el value). Ambas declaran `display` con especificidad idéntica, así que
 * decide el orden de fuente del CSS generado — y ahí `flex` sale 265 bytes
 * después. Medido sobre el CSS que sirve el dev server:
 *
 *   …:line-clamp-1  offset 83884  → overflow:hidden; display:-webkit-box; -webkit-line-clamp:1
 *   …:flex          offset 84149  → display:flex
 *
 * Gana `flex`, el `-webkit-line-clamp` queda inerte (solo aplica sobre
 * `-webkit-box`) y el `overflow:hidden` sobrevive. Resultado: el texto se
 * corta SIN puntos suspensivos. En pantalla se leía
 * `Cuenta corriente BancoSol · 57993` cuando el número real es
 * `5799375-760-305` — un contador puede tomarlo por completo.
 *
 * Estos tests miran el className resultante, no píxeles: jsdom no aplica
 * Tailwind. Es una red débil, pero la clase de bug es exactamente "conviven
 * las dos clases y gana la que no querías", y eso sí se ve acá.
 */
/**
 * Los nombres de clase se ARMAN en vez de escribirse literales, y no es
 * cosmética: Tailwind escanea los tests como fuente, así que un literal acá
 * regenera la utility en el CSS de PRODUCCIÓN. Verificado sobre el bundle —
 * con los literales, `display:flex` volvía a emitirse sobre el value. Nunca
 * llega a matchear (ningún elemento lleva ya esa clase), pero deja regla
 * muerta y, peor, vuelve inverificable en el bundle que la regla en conflicto
 * se purgó.
 */
const VALUE = '*:data-[slot=select-value]';
const enValue = (utility: string) => `${VALUE}:${utility}`;

function renderTrigger(className?: string) {
  render(
    <Select>
      <SelectTrigger
        aria-label="Cuenta"
        {...(className !== undefined ? { className } : {})}
      >
        <SelectValue placeholder="Elegí una cuenta" />
      </SelectTrigger>
    </Select>,
  );
  return screen.getByRole('combobox').className.split(/\s+/);
}

describe('SelectTrigger — recorte del value', () => {
  it('recorta con puntos suspensivos', () => {
    const clases = renderTrigger();

    // `truncate` = overflow:hidden + text-overflow:ellipsis + white-space:nowrap.
    // Es la única utility del CSS de la app que emite `text-overflow`.
    expect(clases).toContain(enValue('truncate'));
    // Un flex item no baja de su contenido sin esto, y el recorte no llega a
    // ocurrir nunca.
    expect(clases).toContain(enValue('min-w-0'));
  });

  it('no deja convivir un segundo display sobre el value', () => {
    const clases = renderTrigger();

    // Las dos que se peleaban el `display`. Si cualquiera vuelve, el
    // `text-overflow` deja de aplicar y el recorte pierde los puntos
    // suspensivos otra vez, en silencio.
    expect(clases).not.toContain(enValue('line-clamp-1'));
    expect(clases).not.toContain(enValue('flex'));
    expect(clases).toContain(enValue('block'));
  });
});

describe('SelectTrigger — ancho', () => {
  // Pinnea el default. Sin este test, el de abajo pasa igual cuando el `w-fit`
  // NO existe — o sea, por la razón equivocada (lo cazó una mutación: borrar
  // `w-fit` del primitivo no mataba ningún test).
  it('trae w-fit cuando el llamador no declara ancho', () => {
    expect(renderTrigger()).toContain('w-fit');
  });

  it('deja ganar el ancho del llamador sobre el w-fit del primitivo', () => {
    const clases = renderTrigger('w-full');

    // Acá tailwind-merge SÍ dedupe: `w-fit` y `w-full` son la misma clave y no
    // hay prefijo de variante de por medio. Es el contraste con el bug del
    // Sheet, donde el prefijo impedía el dedupe.
    expect(clases).toContain('w-full');
    expect(clases).not.toContain('w-fit');
  });
});
