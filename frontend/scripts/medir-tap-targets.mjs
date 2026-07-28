#!/usr/bin/env node
// Mide tap targets por hit-testing sobre las rutas del gate. Es un script
// propio y no un modo de `medir-ui.mjs` porque el modelo de medición es otro:
// medir-ui es un instrumento GENÉRICO de geometría (un selector arbitrario,
// getBoundingClientRect) y esta sonda tiene semántica FIJA (los 4 primitivos
// fuera del piso táctil, elementFromPoint, detección de robo de click, dedup
// bruto/único). Meterlo como modo duplicaría flags incompatibles y mezclaría
// dos esquemas de salida en un archivo. El par medir/gate ya sienta el patrón:
// un script por invariante, la infraestructura compartida en lib/.
//
// El QUÉ y el POR QUÉ de cada medición viven en lib/tap-targets.mjs.

import { parseArgs } from 'node:util';
import { writeFileSync } from 'node:fs';

import { abrir, fallar, iniciarSesion, lanzarNavegador, nuevaPagina } from './lib/navegador.mjs';
import {
  ALCANCE_MAX_PX,
  MINIMO_TAP_PX,
  PASO_BARRIDO_PX,
  PASO_ROBO_PX,
  SELECTORES_TAP,
  resumir,
  sondearTapTargets,
} from './lib/tap-targets.mjs';
import { RUTAS_GATE } from './rutas-gate.mjs';

// Mismo valor y mismo motivo que medir-ui.mjs: medir antes del reflow devuelve
// los px del ancho anterior — un número plausible y equivocado.
const ESPERA_REFLOW_MS = 350;

const AYUDA = `
medir-tap-targets.mjs — mide el área táctil EFECTIVA (hit-testing) de los
primitivos fuera del piso de 44px, y si su box de 44×44 le robaría el click a
otro control.

Uso:
  node scripts/medir-tap-targets.mjs --tactil [opciones]

Opciones:
  --rutas <lista>       Rutas separadas por coma. Default: las ${RUTAS_GATE.length} de rutas-gate.mjs
  --viewports <lista>   Anchos en px. Default: 375,768 (los del gate)
  --alto <px>           Alto del viewport. Default: 900
  --base-url <url>      Default: http://localhost:5173
  --email <mail>        Usuario del seed. Default: founder@avicont.bo
  --password <pass>     Default: password
  --sin-login           No inicia sesión (para rutas públicas)
  --tactil              Emula dedo: \`(pointer: coarse)\` da true. SIN este flag
                        los estilos \`pointer-coarse:\` no aplican y se mide el
                        modo equivocado — para tap targets es casi obligatorio.
  --espera <ms>         Espera tras cambiar el viewport. Default: ${ESPERA_REFLOW_MS}
  --inyectar-css <css>  CSS inyectado en cada ruta ANTES de medir. Existe para
                        validar la sonda por mutación (ej. anular el ::after del
                        checkbox y confirmar que el área cae) y para simular un
                        fix sin tocar el código fuente.
  --out <archivo>       Escribe el JSON ahí. Si se omite, va a stdout.
  --ayuda               Esto.

El JSON incluye \`resumen\` con violaciones BRUTAS y DEDUPLICADAS por primitivo:
todo barrido multi-ruta cuenta N veces los elementos que se repiten entre
pantallas — la métrica accionable es la deduplicada.
`;

function leerArgumentos() {
  // `pnpm run x -- --flag` reenvía el `--` LITERAL; parseArgs explotaría con
  // ERR_PARSE_ARGS_UNEXPECTED_POSITIONAL. Mismo descarte que los otros scripts.
  const args = process.argv.slice(2).filter((a) => a !== '--');

  const { values } = parseArgs({
    args,
    options: {
      rutas: { type: 'string', default: RUTAS_GATE.join(',') },
      viewports: { type: 'string', default: '375,768' },
      alto: { type: 'string', default: '900' },
      'base-url': { type: 'string', default: 'http://localhost:5173' },
      email: { type: 'string', default: 'founder@avicont.bo' },
      password: { type: 'string', default: 'password' },
      'sin-login': { type: 'boolean', default: false },
      tactil: { type: 'boolean', default: false },
      espera: { type: 'string', default: String(ESPERA_REFLOW_MS) },
      'inyectar-css': { type: 'string' },
      out: { type: 'string' },
      ayuda: { type: 'boolean', default: false },
    },
  });

  if (values.ayuda) {
    console.log(AYUDA);
    process.exit(0);
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
    viewports: numeros(values.viewports, '--viewports'),
    alto: numeros(values.alto, '--alto')[0],
    espera: numeros(values.espera, '--espera')[0],
    baseUrl: values['base-url'].replace(/\/$/, ''),
    email: values.email,
    password: values.password,
    sinLogin: values['sin-login'],
    tactil: values.tactil,
    inyectarCss: values['inyectar-css'],
    out: values.out,
  };
}

async function main() {
  const opciones = leerArgumentos();

  if (!opciones.tactil) {
    // Se permite (comparar dedo vs mouse es una medición legítima) pero se
    // avisa fuerte: el modo por defecto de esta sonda es el dedo.
    console.error('⚠ Sin --tactil: (pointer: coarse) da false y los estilos pointer-coarse: NO aplican.');
  }

  const navegador = await lanzarNavegador();
  const planas = [];
  const rutasSaltadas = [];

  try {
    const page = await nuevaPagina(navegador, {
      ancho: opciones.viewports[0],
      alto: opciones.alto,
      tactil: opciones.tactil,
    });

    if (!opciones.sinLogin) await iniciarSesion(page, opciones);

    const configSonda = {
      selectores: SELECTORES_TAP,
      minimo: MINIMO_TAP_PX,
      pasoBarrido: PASO_BARRIDO_PX,
      pasoRobo: PASO_ROBO_PX,
      alcanceMax: ALCANCE_MAX_PX,
    };

    for (const ruta of opciones.rutas) {
      await abrir(page, `${opciones.baseUrl}${ruta}`);

      // Una sesión caída rebota a /login y ahí se mediría la pantalla
      // equivocada. El medidor informa y sigue (a diferencia del gate, que
      // falla): acá el objetivo es el mapa completo, no un veredicto.
      const rutaActual = new URL(page.url()).pathname;
      if (rutaActual !== ruta) {
        rutasSaltadas.push({ ruta, redirigioA: rutaActual });
        console.error(`  ⚠ ${ruta} redirigió a ${rutaActual} — saltada`);
        continue;
      }

      if (opciones.inyectarCss !== undefined) {
        await page.addStyleTag({ content: opciones.inyectarCss });
      }

      for (const ancho of opciones.viewports) {
        await page.setViewportSize({ width: ancho, height: opciones.alto });
        await page.waitForTimeout(opciones.espera);

        const elementos = await page.evaluate(sondearTapTargets, configSonda);
        for (const el of elementos) planas.push({ ruta, ancho, ...el });

        const medibles = elementos.filter((e) => e.visible && !e.cubierto && !e.identidad.deshabilitado);
        const violan = medibles.filter((e) => !e.cumple).length;
        const conRobo = medibles.filter((e) => e.robos.length > 0).length;
        console.error(
          `  ${ruta} @${ancho}px → ${elementos.length} control(es), ${violan} viola(n), ${conRobo} con robo`,
        );
      }
    }
  } finally {
    await navegador.close();
  }

  const resumen = resumir(planas);

  const salida = JSON.stringify(
    {
      baseUrl: opciones.baseUrl,
      tactil: opciones.tactil,
      minimo: MINIMO_TAP_PX,
      inyectarCss: opciones.inyectarCss ?? null,
      rutasSaltadas,
      resumen,
      mediciones: planas,
    },
    null,
    2,
  );

  if (opciones.out === undefined) {
    console.log(salida);
  } else {
    writeFileSync(opciones.out, `${salida}\n`);
    console.error(`\n✔ ${planas.length} medición(es) escritas en ${opciones.out}`);
  }

  // Resumen legible a stderr — el JSON completo queda para el análisis fino.
  for (const [ancho, porSlot] of Object.entries(resumen)) {
    console.error(`\n== @${ancho}px ==`);
    for (const [slot, s] of Object.entries(porSlot)) {
      console.error(
        `  ${slot.padEnd(14)} brutos:${String(s.brutos).padStart(4)}  únicos:${String(s.unicos).padStart(3)}  ` +
          `violan:${String(s.violacionesBrutas).padStart(4)}/${String(s.violacionesUnicas).padStart(3)} (bruto/único)  ` +
          `robo:${s.conRoboBruto}/${s.conRoboUnico}  ocultos:${s.noVisibles}  deshab:${s.deshabilitados}  cubiertos:${s.cubiertos}`,
      );
    }
  }
}

await main();
