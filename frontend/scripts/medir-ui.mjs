#!/usr/bin/env node
// Escalón 5 de `docs/claude/verificacion-frontend.md`: el único escalón que mide
// píxeles. Los de abajo (grep, test de className en jsdom, CSS compilado) dicen
// qué clases se escriben, cuáles llegan al DOM y cuál gana la cascada — ninguno
// dice cuánto mide algo, si desborda o si el recorte dibuja puntos suspensivos.
//
// Existe versionado —y no como archivo desechable en un scratchpad— porque el
// barrido de regresión sólo sirve si la medición de HOY es comparable con la de
// la próxima sesión. Un script que se reescribe cada vez mide distinto cada vez.

import { parseArgs } from 'node:util';
import { writeFileSync } from 'node:fs';

import { abrir, fallar, iniciarSesion, lanzarNavegador } from './lib/navegador.mjs';

// El reflow tras cambiar el viewport no es instantáneo. Medir antes devuelve los
// px del ancho ANTERIOR: un número plausible y equivocado, que es la peor clase
// de error de medición (§5 del doc: "si el resultado te sorprende, sospechá
// primero del instrumento").
const ESPERA_REFLOW_MS = 350;

const AYUDA = `
medir-ui.mjs — mide en un navegador real (Chromium) lo que ninguna otra herramienta puede.

Uso:
  pnpm run medir:ui -- --rutas <r1,r2> --selector <css> [opciones]

Obligatorios:
  --rutas <lista>       Rutas separadas por coma. Ej: /comprobantes,/eeff/libro-mayor
  --selector <css>      Selector CSS a medir. Se miden TODAS las coincidencias.

Opciones:
  --viewports <lista>   Anchos en px. Default: 375,768,1440 (los tres de §7)
  --alto <px>           Alto del viewport. Default: 900
  --base-url <url>      Default: http://localhost:5173
  --email <mail>        Usuario del seed. Default: founder@avicont.bo
  --password <pass>     Default: password
  --sin-login           No inicia sesión (para rutas públicas como /login)
  --espera <ms>         Espera tras cambiar el viewport. Default: ${ESPERA_REFLOW_MS}
  --out <archivo>       Escribe el JSON ahí. Si se omite, va a stdout.
  --ayuda               Esto.

Protocolo antes/después (§3.4 del doc — es lo que hace convincente la evidencia):
  1. Con el fix aplicado:  --out /tmp/despues.json
  2. Revertí SOLO el archivo del fix, esperá el HMR (~5 s)
  3. Misma invocación:     --out /tmp/antes.json
  4. git checkout -- <archivo>   (y verificá que el árbol quedó limpio)
  5. diff /tmp/antes.json /tmp/despues.json
`;

function leerArgumentos() {
  // `pnpm run medir:ui -- --rutas …` reenvía el `--` LITERAL al script (verificado
  // con pnpm 11.2.2). `parseArgs` lo trata como terminador de opciones, así que
  // todo lo que sigue pasaría a ser posicional y explotaría con
  // ERR_PARSE_ARGS_UNEXPECTED_POSITIONAL — un error que no dice nada sobre la
  // causa real. Se descarta acá para que las dos formas de invocar funcionen.
  const args = process.argv.slice(2).filter((a) => a !== '--');

  const { values } = parseArgs({
    args,
    options: {
      rutas: { type: 'string' },
      selector: { type: 'string' },
      viewports: { type: 'string', default: '375,768,1440' },
      alto: { type: 'string', default: '900' },
      'base-url': { type: 'string', default: 'http://localhost:5173' },
      email: { type: 'string', default: 'founder@avicont.bo' },
      password: { type: 'string', default: 'password' },
      'sin-login': { type: 'boolean', default: false },
      espera: { type: 'string', default: String(ESPERA_REFLOW_MS) },
      out: { type: 'string' },
      ayuda: { type: 'boolean', default: false },
    },
  });

  if (values.ayuda) {
    console.log(AYUDA);
    process.exit(0);
  }

  if (values.rutas === undefined || values.selector === undefined) {
    fallar('Faltan argumentos obligatorios: --rutas y --selector.', [
      'Corré `pnpm run medir:ui -- --ayuda` para ver el uso completo.',
    ]);
  }

  const numeros = (lista, etiqueta) => {
    const parseados = lista.split(',').map((n) => Number(n.trim()));
    if (parseados.some((n) => !Number.isFinite(n) || n <= 0)) {
      fallar(`Valor inválido en ${etiqueta}: "${lista}".`, ['Se esperaban números positivos separados por coma.']);
    }
    return parseados;
  };

  return {
    rutas: values.rutas.split(',').map((r) => r.trim()).filter((r) => r !== ''),
    selector: values.selector,
    viewports: numeros(values.viewports, '--viewports'),
    alto: numeros(values.alto, '--alto')[0],
    espera: numeros(values.espera, '--espera')[0],
    baseUrl: values['base-url'].replace(/\/$/, ''),
    email: values.email,
    password: values.password,
    sinLogin: values['sin-login'],
    out: values.out,
  };
}

// Se miden TODAS las coincidencias del selector, nunca la primera. Es la lección
// del PR #276: el `grep` ENUMERA candidatos, el navegador los CUENTA — ahí un
// selector daba 3 sitios por grep y 6 en pantalla, y uno de los invisibles estaba
// compartido por 9 pantallas de reportes.
function medirEnLaPagina(sel) {
  const redondear = (n) => Number(n.toFixed(2));

  return Array.from(document.querySelectorAll(sel)).map((el, indice) => {
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();

    return {
      indice,
      texto: (el.textContent ?? '').trim().slice(0, 60),
      ancho: redondear(r.width),
      alto: redondear(r.height),
      x: redondear(r.x),
      y: redondear(r.y),
      display: cs.display,
      textOverflow: cs.textOverflow,
      overflowX: cs.overflowX,
      fontSize: cs.fontSize,
      // scrollWidth > clientWidth ⇒ el contenido NO entra ⇒ el navegador recorta.
      // Con text-overflow:ellipsis dibuja "…"; con clip, corta en seco (PR #274).
      desborda: el.scrollWidth > el.clientWidth,
    };
  });
}

async function main() {
  const opciones = leerArgumentos();
  const navegador = await lanzarNavegador();

  try {
    const page = await navegador.newPage({
      viewport: { width: opciones.viewports[0], height: opciones.alto },
    });

    if (!opciones.sinLogin) await iniciarSesion(page, opciones);

    const mediciones = [];

    for (const ruta of opciones.rutas) {
      await abrir(page, `${opciones.baseUrl}${ruta}`);

      for (const ancho of opciones.viewports) {
        await page.setViewportSize({ width: ancho, height: opciones.alto });
        await page.waitForTimeout(opciones.espera);

        const elementos = await page.evaluate(medirEnLaPagina, opciones.selector);
        mediciones.push({ ruta, ancho, coincidencias: elementos.length, elementos });

        // Un elemento con ancho 0 no es un bug del script: el selector coincide
        // pero el elemento no se renderiza en ese viewport (tabla desktop oculta
        // en mobile, por ejemplo). Se informa, no se filtra.
        console.error(`  ${ruta} @ ${ancho}px → ${elementos.length} coincidencia(s)`);
      }
    }

    const salida = JSON.stringify(
      { baseUrl: opciones.baseUrl, selector: opciones.selector, mediciones },
      null,
      2,
    );

    if (opciones.out === undefined) {
      console.log(salida);
    } else {
      writeFileSync(opciones.out, `${salida}\n`);
      console.error(`\n✔ ${mediciones.length} medición(es) escritas en ${opciones.out}`);
    }
  } finally {
    await navegador.close();
  }
}

await main();
