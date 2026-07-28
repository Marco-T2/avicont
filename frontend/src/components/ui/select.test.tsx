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

/**
 * Mismo motivo que `enValue`: el nombre se ARMA para que el escáner de
 * Tailwind no lo levante del test y vuelva a emitir en el CSS de producción
 * justo la regla prefijada que este arreglo sacó del primitivo.
 */
const SIZE = 'data-[size';
const conSize = (valor: string, utility: string) =>
  `${SIZE}=${valor}]:${utility}`;

// Armado por el mismo motivo: que el escáner no regenere la utility desde acá.
const PISO_TACTIL = ['pointer-coarse', ['min-h', '11'].join('-')].join(':');

function renderTrigger(className?: string, size?: 'sm' | 'default') {
  render(
    <Select>
      <SelectTrigger
        aria-label="Cuenta"
        {...(className !== undefined ? { className } : {})}
        {...(size !== undefined ? { size } : {})}
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

/**
 * Cuarta instancia de la misma familia. El alto vivía en `data-[size=…]:h-9`,
 * que tailwind-merge no puede deduplicar contra el `h-8` plano del llamador:
 * convivían los dos y en CSS ganaba el selector de atributo por especificidad.
 *
 * Medido en navegador sobre los 6 sitios que declaran alto: pedían h-8 (32px)
 * y renderizaban 36px. Uno de ellos es `PeriodoGestionFiltro`, compartido por
 * 9 pantallas de reportes.
 */
describe('SelectTrigger — alto', () => {
  // Pinnea el default. Sin este test, el "deja ganar al llamador" de abajo
  // pasa igual si el default desaparece del primitivo — o sea, por la razón
  // equivocada (misma lección que el `w-fit` de acá arriba).
  it('trae el alto por defecto como clase plana', () => {
    const clases = renderTrigger();

    expect(clases).toContain('h-9');
    // La prefijada por variante es la que causaba el bug: si vuelve, el alto
    // del llamador queda inerte otra vez y en silencio.
    expect(clases).not.toContain(conSize('default', 'h-9'));
  });

  it('respeta el alto chico cuando se lo pide por el prop size', () => {
    const clases = renderTrigger(undefined, 'sm');

    expect(clases).toContain('h-8');
    expect(clases).not.toContain('h-9');
    expect(clases).not.toContain(conSize('sm', 'h-8'));
  });

  it('deja ganar el alto del llamador sobre el default del primitivo', () => {
    const clases = renderTrigger('h-11 sm:h-8');

    // Plano contra plano: tailwind-merge sí dedupe y el llamador manda.
    expect(clases).toContain('h-11');
    // Por sufijo y no por igualdad: `not.toContain('h-9')` NO ve el token
    // `data-[size=default]:h-9`, que es otro string — verificado por mutación,
    // con el bug de vuelta este test pasaba igual.
    expect(clases.filter((c) => c.endsWith('h-9'))).toHaveLength(0);
    // El prefijo responsive es otra clave, así que sobrevive intacto. (Que un
    // llamador NO deba escribir `h-11 sm:h-8` es la convención §7 — acá solo
    // se prueba la mecánica del merge.)
    expect(clases).toContain('sm:h-8');
  });
});

/**
 * Red DÉBIL, igual que en button.tsx/input.tsx: jsdom no aplica Tailwind, así
 * que esto prueba que la clase llega al DOM, no que gane la cascada. El layout
 * real se verificó por hit-testing en navegador (`pnpm run medir:tap --tactil`).
 * Lo que caza: que el piso táctil se borre del primitivo sin que nadie lo note,
 * o que vuelva la convención vieja por breakpoint al lado del piso.
 */
describe('SelectTrigger — piso táctil de 44px (pointer: coarse)', () => {
  it('lleva el piso de alto', () => {
    expect(renderTrigger()).toContain(PISO_TACTIL);
  });

  it('el piso sobrevive al merge con un alto del llamador', () => {
    // tailwind-merge solo colapsa clases del MISMO grupo y MISMO prefijo de
    // variante: el h-8 plano del llamador no debe comerse el min-h táctil.
    expect(renderTrigger(['h', '8'].join('-'))).toContain(PISO_TACTIL);
  });

  it('no reintroduce el piso por breakpoint (convención vieja)', () => {
    // Gemelo negativo del piso: mata al mutante "piso presente Y además
    // `md:h-*`/`md:min-h-*` al lado", que es la convención vieja disfrazada.
    const conBreakpoint = renderTrigger().filter((c) =>
      /^md:(min-h|h|py|p)-/.test(c),
    );
    expect(conBreakpoint).toHaveLength(0);
  });
});
