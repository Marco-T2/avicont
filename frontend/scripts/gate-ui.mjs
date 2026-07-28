#!/usr/bin/env node
// Gate de UI: falla el build si alguna pantalla recorta contenido horizontalmente.
//
// El invariante NO se eligió a ojo. Se midió la app entera con `medir:ui` y el
// dato descartó al candidato obvio: "tap targets ≥44px" lo violaban 141 de 217
// controles visibles @375, porque el propio sistema de diseño no cumplía su
// mínimo. Un gate así nace con las excepciones puestas, o sea no assertea nada.
// (Eso cambió: los PRs #285/#286 y el piso en los 4 primitivos llevaron el
// baseline a cero, y hoy tap targets SÍ es gate — `gate-tap-targets.mjs`, que
// emula dedo. Este script sigue midiendo SIN emulación táctil a propósito:
// desborde en modo escritorio; cada invariante en su script.)
//
// Este invariante es binario por pantalla y su baseline es verde con
// la allowlist vacía. Ver `docs/claude/verificacion-frontend.md` §6.
//
// Por qué `main` y no `body`: `dashboard-shell.tsx` envuelve el contenido en un
// contenedor con `overflow-hidden`, así que el desborde NUNCA llega al body.
// Medido sobre `body` esto daba cero violaciones en toda la app — con un div de
// 2000px inyectado a propósito seguía dando cero. El cero era del instrumento,
// no de la app.
//
// Lo que el gate protege es contenido INALCANZABLE: recortado sin scroll que lo
// rescate. En /comprobantes a 375px el CTA "Nuevo comprobante" terminaba en
// x=490 sobre un viewport de 375.

import { parseArgs } from 'node:util';

import { abrir, fallar, iniciarSesion, lanzarNavegador, nuevaPagina } from './lib/navegador.mjs';
import { RUTAS_GATE, VIEWPORTS } from './rutas-gate.mjs';

// Mismo valor que `medir-ui.mjs`. Verificado que alcanza: el barrido completo da
// resultados idénticos con 350ms y con 1500ms, así que las violaciones que
// reporta son estables y no una carrera contra el reflow.
const ESPERA_REFLOW_MS = 350;

const AYUDA = `
gate-ui.mjs — falla si alguna pantalla recorta contenido horizontalmente.

Uso:
  pnpm run gate:ui [opciones]

Opciones:
  --base-url <url>   Default: http://localhost:4173 (vite preview)
  --email <mail>     Usuario del seed. Default: founder@avicont.bo
  --password <pass>  Default: password
  --espera <ms>      Espera tras cambiar el viewport. Default: ${ESPERA_REFLOW_MS}
  --tactil           Emula un dispositivo táctil: \`(pointer: coarse)\` da true y
                     aplican los estilos bajo \`pointer-coarse:\` (tap targets de
                     44px). Default: apagado — que el gate de CI emule touch es
                     una decisión aparte, porque los mínimos táctiles engordan
                     elementos y pueden hacer desbordar pantallas hoy verdes.
  --ayuda            Esto.

Requiere el backend en :3000 (con seed corrido) y el frontend servido en
--base-url. En CI eso lo arma el job \`ui-gate\` de .github/workflows/ci.yml.

Si falla: reproducí el caso con el instrumento de medición, que además muestra
la geometría de cada elemento:
  pnpm run medir:ui -- --selector 'main *' --rutas <la-ruta> --viewports <el-ancho>
`;

function leerArgumentos() {
  // `pnpm run x -- --flag` reenvía el `--` LITERAL; parseArgs lo tomaría como
  // terminador de opciones y explotaría con ERR_PARSE_ARGS_UNEXPECTED_POSITIONAL.
  const args = process.argv.slice(2).filter((a) => a !== '--');

  const { values } = parseArgs({
    args,
    options: {
      'base-url': { type: 'string', default: 'http://localhost:4173' },
      email: { type: 'string', default: 'founder@avicont.bo' },
      password: { type: 'string', default: 'password' },
      espera: { type: 'string', default: String(ESPERA_REFLOW_MS) },
      tactil: { type: 'boolean', default: false },
      ayuda: { type: 'boolean', default: false },
    },
  });

  if (values.ayuda) {
    console.log(AYUDA);
    process.exit(0);
  }

  const espera = Number(values.espera);
  if (!Number.isFinite(espera) || espera <= 0) {
    fallar(`Valor inválido en --espera: "${values.espera}".`, ['Se esperaba un número positivo.']);
  }

  return {
    baseUrl: values['base-url'].replace(/\/$/, ''),
    email: values.email,
    password: values.password,
    espera,
    tactil: values.tactil,
  };
}

// Corre DENTRO de la página. Devuelve el veredicto de una pantalla en un ancho.
function inspeccionarDesborde() {
  const main = document.querySelector('main');
  if (main === null) return { sinMain: true };

  if (main.scrollWidth <= main.clientWidth) return { sinMain: false, desborda: false };

  // Con desborde confirmado, se nombran los elementos que se pasan del borde
  // derecho. Sin esto el error dice "algo se sale" y deja la búsqueda a mano.
  const limite = main.getBoundingClientRect().right;
  const culpables = Array.from(main.querySelectorAll('*'))
    .map((el) => {
      const r = el.getBoundingClientRect();
      return {
        tag: el.tagName.toLowerCase(),
        derecha: Number(r.right.toFixed(1)),
        ancho: Number(r.width.toFixed(1)),
        texto: (el.textContent ?? '').trim().slice(0, 50),
      };
    })
    .filter((c) => c.derecha > limite + 0.5)
    .sort((a, b) => b.derecha - a.derecha)
    .slice(0, 3);

  return {
    sinMain: false,
    desborda: true,
    scrollWidth: main.scrollWidth,
    clientWidth: main.clientWidth,
    limite: Number(limite.toFixed(1)),
    culpables,
  };
}

async function main() {
  const opciones = leerArgumentos();
  const navegador = await lanzarNavegador();
  const violaciones = [];

  try {
    const page = await nuevaPagina(navegador, {
      ancho: VIEWPORTS[0],
      alto: 900,
      tactil: opciones.tactil,
    });

    await iniciarSesion(page, opciones);

    for (const ruta of RUTAS_GATE) {
      await abrir(page, `${opciones.baseUrl}${ruta}`);

      // Una sesión que se cae rebota a /login, y ahí no hay <main> que medir:
      // sin este chequeo el gate pasaría en verde sin haber visto la pantalla.
      const urlActual = new URL(page.url()).pathname;
      if (urlActual !== ruta) {
        fallar(`La ruta ${ruta} redirigió a ${urlActual}.`, [
          'El gate no puede evaluar una pantalla que no se abrió.',
          'Causas habituales: sesión caída, permiso faltante en el usuario del seed,',
          'o la ruta dejó de existir y quedó vieja en scripts/rutas-gate.mjs.',
        ]);
      }

      for (const ancho of VIEWPORTS) {
        await page.setViewportSize({ width: ancho, height: 900 });
        await page.waitForTimeout(opciones.espera);

        const r = await page.evaluate(inspeccionarDesborde);

        // Fail-closed: sin <main> no hay medición, y "no medí" jamás se reporta
        // como "está bien".
        if (r.sinMain) {
          fallar(`${ruta} @${ancho}px no tiene <main>.`, [
            'Toda pantalla del DashboardShell lo tiene; su ausencia es un síntoma,',
            'no un caso a ignorar. Si la ruta es pública, va en RUTAS_EXCLUIDAS.',
          ]);
        }

        if (r.desborda) violaciones.push({ ruta, ancho, ...r });
        console.error(`  ${r.desborda ? '✖' : '✓'} ${ruta} @${ancho}px`);
      }
    }
  } finally {
    await navegador.close();
  }

  const total = RUTAS_GATE.length * VIEWPORTS.length;

  if (violaciones.length === 0) {
    console.log(`\n✔ ${total} mediciones (${RUTAS_GATE.length} rutas × ${VIEWPORTS.length} viewports): ninguna recorta.`);
    return;
  }

  console.error(`\n✖ ${violaciones.length} de ${total} mediciones recortan contenido horizontalmente.\n`);
  for (const v of violaciones) {
    console.error(`  ${v.ruta} @${v.ancho}px — main mide ${v.clientWidth}px y su contenido ${v.scrollWidth}px`);
    for (const c of v.culpables) {
      console.error(`      <${c.tag}> ancho=${c.ancho} termina en x=${c.derecha} (borde: ${v.limite})  ${JSON.stringify(c.texto)}`);
    }
  }
  console.error(
    '\n  El contenido recortado queda INALCANZABLE: dashboard-shell recorta con',
    '\n  overflow-hidden, así que no hay scroll horizontal que lo rescate.',
    '\n  Para ver la geometría completa de la pantalla:',
    `\n    pnpm run medir:ui -- --selector 'main *' --rutas ${violaciones[0].ruta} --viewports ${violaciones[0].ancho}`,
  );
  process.exit(1);
}

await main();
