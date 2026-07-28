#!/usr/bin/env node
// Gate de tap targets: falla el build si algún primitivo fuera del piso nativo
// (checkbox, switch, tabs-trigger, select-trigger) mide menos de 44×44 de área
// táctil EFECTIVA bajo dedo, o si su box de 44px le roba el click a otro
// control. Es la señal antirregresión del piso táctil de frontend/CLAUDE.md §7.
//
// Por qué existe: sin gate, el piso es una promesa — ya se rompió una vez. El
// PR #285 escribió "el piso es del dispositivo, no uses md:min-h-0" en el doc
// y dejó intacto el archivo que más lo violaba (el sidebar, arreglado recién
// en el #286). Un doc no falla el build; esto sí.
//
// Es un script propio y no un modo de `gate-ui.mjs` por dos razones:
//   1. gate-ui corre SIN emulación táctil a propósito (mide desborde de main
//      en modo escritorio) y este invariante EXIGE `(pointer: coarse)` — los
//      estilos pointer-coarse: no aplican sin él y el verde no probaría nada.
//      Meterlo ahí obligaría a segundas pasadas condicionales dentro del mismo
//      script y cambiaría lo que hoy significa su verde.
//   2. El repo ya sienta el patrón "un script por invariante" (medir-ui/gate-ui,
//      medir-tap-targets/este). La sonda compartida vive en lib/tap-targets.mjs.
//
// La medición es por HIT-TESTING (elementFromPoint), no getBoundingClientRect:
// el piso de estos primitivos se aplica con pseudo-elementos invisibles que
// getBoundingClientRect no ve. El QUÉ y el POR QUÉ de cada medición viven en
// lib/tap-targets.mjs.
//
// Allowlist: VACÍA, y no hay estructura de allowlist en este archivo a
// propósito — el baseline es verde sin excepciones (igual que gate-ui). Si
// alguna vez una excepción se vuelve inevitable, se agrega con: (a) motivo
// escrito, (b) auto-limpieza — el gate DEBE fallar si la excepción deja de ser
// necesaria, como hace catalogo-vs-controllers.spec.ts — y (c) discusión en
// PR. Una allowlist de un solo sentido se pudre.
//
// Lo que este gate NO alcanza (declarado, no escondido):
//   • /platform-admin/* — exige super-admin y el founder del seed no lo es
//     (ver RUTAS_EXCLUIDAS). Ahí vive un switch en celda de tabla
//     (feature-flags-page.tsx:175, fila ≈34px) que quedó SIN VERIFICAR: si se
//     habilita una sesión super-admin en el gate, ese es el primer sospechoso.
//   • /granja/* — la org del seed es vertical CONTABILIDAD; la pantalla real
//     nunca se monta.
//   • Contenido de sheets/dialogs que exigen un click para montarse: la sonda
//     mide lo que renderiza la ruta al abrir, no estados interactivos.

import { parseArgs } from 'node:util';

import { abrir, fallar, iniciarSesion, lanzarNavegador, nuevaPagina } from './lib/navegador.mjs';
import {
  ALCANCE_MAX_PX,
  MINIMO_TAP_PX,
  PASO_BARRIDO_PX,
  PASO_ROBO_PX,
  SELECTORES_TAP,
  sondearTapTargets,
} from './lib/tap-targets.mjs';
import { RUTAS_GATE, VIEWPORTS } from './rutas-gate.mjs';

// Mismo valor y mismo motivo que gate-ui.mjs: medir antes del reflow devuelve
// los px del ancho anterior.
const ESPERA_REFLOW_MS = 350;

const AYUDA = `
gate-tap-targets.mjs — falla si algún primitivo del piso táctil mide menos de
${MINIMO_TAP_PX}×${MINIMO_TAP_PX} bajo dedo, o si su box de ${MINIMO_TAP_PX}px le roba el click a otro control.

Uso:
  pnpm run gate:tap [opciones]

Opciones:
  --base-url <url>      Default: http://localhost:4173 (vite preview)
  --email <mail>        Usuario del seed. Default: founder@avicont.bo
  --password <pass>     Default: password
  --espera <ms>         Espera tras cambiar el viewport. Default: ${ESPERA_REFLOW_MS}
  --inyectar-css <css>  CSS inyectado en cada ruta ANTES de medir. Existe para
                        validar el gate por MUTACIÓN: revertir el fix de un
                        primitivo y confirmar que el gate falla nombrándolo.
  --ayuda               Esto.

La emulación táctil NO es opcional acá: el invariante está definido bajo
(pointer: coarse) y sin ella los estilos pointer-coarse: no aplican — el gate
mediría el modo equivocado. Por eso no hay flag --tactil: siempre va activa.

Requiere el backend en :3000 (con seed corrido) y el frontend servido en
--base-url. En CI eso lo arma el job \`ui-gate\` de .github/workflows/ci.yml.

Si falla: reproducí el caso con la sonda de medición, que muestra la geometría
completa (extensión por lado, viaLabel, ladrones):
  pnpm run medir:tap -- --tactil --rutas <la-ruta> --viewports <el-ancho>
(medir:tap apunta por default al dev server :5173; este gate al preview :4173.)
`;

function leerArgumentos() {
  // `pnpm run x -- --flag` reenvía el `--` LITERAL; parseArgs explotaría con
  // ERR_PARSE_ARGS_UNEXPECTED_POSITIONAL. Mismo descarte que los otros scripts.
  const args = process.argv.slice(2).filter((a) => a !== '--');

  const { values } = parseArgs({
    args,
    options: {
      'base-url': { type: 'string', default: 'http://localhost:4173' },
      email: { type: 'string', default: 'founder@avicont.bo' },
      password: { type: 'string', default: 'password' },
      espera: { type: 'string', default: String(ESPERA_REFLOW_MS) },
      'inyectar-css': { type: 'string' },
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
    inyectarCss: values['inyectar-css'],
  };
}

/** Identidad legible del control para que el error sea accionable sin abrir DevTools. */
function nombrar(elemento) {
  const id = elemento.identidad;
  const etiqueta = id.ariaLabel ?? id.labelTexto ?? id.name ?? id.id ?? id.testId ?? id.texto;
  return etiqueta === null || etiqueta === undefined
    ? `${elemento.slot} #${elemento.indice} (sin identidad — agregale aria-label o id)`
    : `${elemento.slot} "${etiqueta}"`;
}

async function main() {
  const opciones = leerArgumentos();
  const navegador = await lanzarNavegador();
  const violaciones = [];
  const robos = [];

  try {
    // tactil: true SIEMPRE — el invariante vive bajo (pointer: coarse).
    const page = await nuevaPagina(navegador, {
      ancho: VIEWPORTS[0],
      alto: 900,
      tactil: true,
    });

    await iniciarSesion(page, opciones);

    const configSonda = {
      selectores: SELECTORES_TAP,
      minimo: MINIMO_TAP_PX,
      pasoBarrido: PASO_BARRIDO_PX,
      pasoRobo: PASO_ROBO_PX,
      alcanceMax: ALCANCE_MAX_PX,
    };

    for (const ruta of RUTAS_GATE) {
      await abrir(page, `${opciones.baseUrl}${ruta}`);

      // Una sesión que se cae rebota a /login y ahí no hay nada que medir:
      // sin este chequeo el gate pasaría en verde sin haber visto la pantalla.
      const urlActual = new URL(page.url()).pathname;
      if (urlActual !== ruta) {
        fallar(`La ruta ${ruta} redirigió a ${urlActual}.`, [
          'El gate no puede evaluar una pantalla que no se abrió.',
          'Causas habituales: sesión caída, permiso faltante en el usuario del seed,',
          'o la ruta dejó de existir y quedó vieja en scripts/rutas-gate.mjs.',
        ]);
      }

      if (opciones.inyectarCss !== undefined) {
        await page.addStyleTag({ content: opciones.inyectarCss });
      }

      for (const ancho of VIEWPORTS) {
        await page.setViewportSize({ width: ancho, height: 900 });
        await page.waitForTimeout(opciones.espera);

        const elementos = await page.evaluate(sondearTapTargets, configSonda);

        // No visibles (variante de otro viewport) y deshabilitados no violan;
        // `cubierto` SÍ: un control tapado no es tocable y eso es fail-closed.
        const medibles = elementos.filter((e) => e.visible && !e.identidad.deshabilitado);

        for (const e of medibles) {
          if (!e.cumple) violaciones.push({ ruta, ancho, elemento: e });
          if (e.robos.length > 0) robos.push({ ruta, ancho, elemento: e });
        }

        const mal = medibles.filter((e) => !e.cumple || e.robos.length > 0).length;
        console.error(`  ${mal > 0 ? '✖' : '✓'} ${ruta} @${ancho}px (${medibles.length} control(es))`);
      }
    }
  } finally {
    await navegador.close();
  }

  const total = RUTAS_GATE.length * VIEWPORTS.length;

  if (violaciones.length === 0 && robos.length === 0) {
    console.log(
      `\n✔ ${total} mediciones (${RUTAS_GATE.length} rutas × ${VIEWPORTS.length} viewports): ` +
        `todos los primitivos en el piso de ${MINIMO_TAP_PX}×${MINIMO_TAP_PX} y sin robo de click.`,
    );
    return;
  }

  if (violaciones.length > 0) {
    console.error(`\n✖ ${violaciones.length} medición(es) por debajo del piso táctil de ${MINIMO_TAP_PX}×${MINIMO_TAP_PX}:\n`);
    for (const { ruta, ancho, elemento } of violaciones) {
      const t = elemento.tactil;
      console.error(`  ${ruta} @${ancho}px — ${nombrar(elemento)} mide ${t.ancho}×${t.alto}`);
      if (elemento.cubierto) {
        const q = elemento.quienCubre;
        console.error(
          `      cubierto por <${q?.tag ?? '?'}>${q?.slot !== null && q?.slot !== undefined ? ` [data-slot=${q.slot}]` : ''}: el centro del control no resuelve a él.`,
        );
      }
    }
  }

  if (robos.length > 0) {
    console.error(`\n✖ ${robos.length} medición(es) con robo de click (el box de ${MINIMO_TAP_PX}px pisa otro control):\n`);
    for (const { ruta, ancho, elemento } of robos) {
      console.error(`  ${ruta} @${ancho}px — ${nombrar(elemento)}:`);
      for (const l of elemento.robos) {
        const quien = `${l.slot ?? l.tag}${l.ariaLabel !== null ? ` "${l.ariaLabel}"` : l.texto !== null ? ` "${l.texto}"` : ''}`;
        console.error(`      pisa a ${quien} por ${l.lados.join('/')} (${l.puntos} punto(s))${l.esAncestroDelControl ? ' [ancestro]' : ''}`);
      }
    }
  }

  console.error(
    '\n  El piso táctil lo aplican los primitivos de components/ui/ bajo',
    '\n  (pointer: coarse) — ver frontend/CLAUDE.md §7. Para ver la geometría',
    '\n  completa del caso (extensión por lado, viaLabel, ladrones):',
    `\n    pnpm run medir:tap -- --tactil --rutas ${(violaciones[0] ?? robos[0]).ruta} --viewports ${(violaciones[0] ?? robos[0]).ancho}`,
  );
  process.exit(1);
}

await main();
