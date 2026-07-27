import { describe, expect, it } from 'vitest';

// `?raw` devuelve el archivo sin procesar. Se prefiere a leerlo con `fs` porque
// no depende del cwd del runner: `import.meta.url` bajo el transform de Vite no
// es un `file:` y `fileURLToPath` falla.
import css from './index.css?raw';

/**
 * Red DÉBIL, y hay que decirlo acá mismo: esto es el escalón 1 de
 * `docs/claude/verificacion-frontend.md` (leer el archivo). No prueba que la
 * regla APLIQUE — para eso hace falta un navegador con una pantalla larga de
 * verdad, y eso no corre en CI hoy.
 *
 * Existe por una razón concreta: el fix es una sola regla en un CSS global, sin
 * ningún componente que la referencie. Nada en el repo la menciona, así que un
 * borrado accidental no rompe ni el build ni un test ni el gate de UI — el bug
 * vuelve callado y sólo se nota cuando alguien arma una pantalla larga con
 * controles de formulario. Este test es lo único que convierte ese borrado en
 * un fallo.
 *
 * Por qué el gate de UI NO cubre esto: mide `main` a 375/768 sobre las
 * pantallas actuales, y ninguna tiene hoy contenido suficiente para que el
 * BubbleInput caiga fuera del `<html>`. Sumarle el invariante daría un verde
 * que no se puede romper rompiendo el fix — o sea, un test que pasa siempre.
 *
 * La verificación real fue en navegador, por mutación, sobre
 * /settings/roles/nuevo con 1500px de empuje:
 *   fix activo, padres relative   → scrollY 0
 *   fix activo, padres static     → scrollY 0
 *   fix ANULADO, padres static    → scrollY 1317
 */
describe('index.css — anclaje del BubbleInput de Radix', () => {
  it('ancla el input oculto al origen de su containing block', () => {
    // El selector se ARMA en vez de escribirse literal: Tailwind escanea los
    // tests como fuente, y un literal de utility acá reaparecería en el CSS de
    // producción (§4.1 del doc). Acá son selectores de atributo, no utilities,
    // pero la costumbre se mantiene para no tener que decidir caso por caso.
    const oculto = (tag: string) => `${tag}[aria-hidden='true'][tabindex='-1']`;

    expect(css).toContain(oculto('input'));
    expect(css).toContain(oculto('select'));
  });

  it('usa !important, sin el cual la regla es inerte', () => {
    // Radix aplica su style inline DESPUÉS del spread de props: sin
    // `!important` esta regla pierde siempre y el fix no existe.
    const bloque = css.slice(css.indexOf("input[aria-hidden='true']"));
    expect(bloque).toMatch(/top:\s*0\s*!important/);
    expect(bloque).toMatch(/left:\s*0\s*!important/);
  });
});
