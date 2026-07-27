// Piezas compartidas por los dos scripts que manejan un navegador real:
// `medir-ui.mjs` (mide y reporta) y `gate-ui.mjs` (mide y falla).
//
// Viven acá y no duplicadas en cada uno porque el login y el arranque de
// Chromium son exactamente el mismo problema para ambos. Duplicarlos garantiza
// que dentro de unos meses uno de los dos tenga un timeout distinto, o un
// mensaje de error que ya no describe la causa real.

import { chromium } from 'playwright';

export function fallar(titulo, pistas, causa) {
  console.error(`\n✖ ${titulo}\n`);
  for (const pista of pistas) console.error(`  ${pista}`);
  if (causa instanceof Error) console.error(`\n  Error original: ${causa.message}`);
  process.exit(1);
}

export async function lanzarNavegador() {
  try {
    // --no-sandbox: sin esto Chromium no arranca bajo WSL2 ni en contenedores.
    return await chromium.launch({ args: ['--no-sandbox'] });
  } catch (causa) {
    fallar(
      'No se pudo lanzar Chromium.',
      [
        'Playwright NO nombra la causa real en su mensaje; las dos posibles son:',
        '',
        '1. Falta el binario del browser (no viaja en el `pnpm install`):',
        '     pnpm exec playwright install chromium',
        '',
        '2. Faltan librerías del sistema (Ubuntu 24.04):',
        '     sudo apt-get install -y libnspr4 libnss3 libasound2t64',
        '   El paquete es `libasound2t64`; el nombre viejo `libasound2` ya no existe.',
        '   Diagnóstico real: ldd ~/.cache/ms-playwright/chromium-*/chrome-linux/chrome | grep "not found"',
        '   (`sudo` no corre con el prefijo `!` de Claude Code: no hay TTY.)',
      ],
      causa,
    );
  }
}

// `hasTouch: true` es lo ÚNICO que hace falta para que Chromium responda
// `matches: true` a `(pointer: coarse)` — verificado con Playwright 1.61 sobre
// about:blank: `isMobile` solo NO lo cambia (sigue `pointer: fine`), y con
// `hasTouch` cambian también `any-pointer: coarse` y `hover: none`. Sin esta
// opción, cualquier fix condicionado a `pointer-coarse:` es INVISIBLE para
// estos scripts: medirían el modo escritorio y darían un verde que no prueba
// nada sobre táctil.
export async function nuevaPagina(navegador, { ancho, alto, tactil = false }) {
  return navegador.newPage({
    viewport: { width: ancho, height: alto },
    ...(tactil ? { hasTouch: true } : {}),
  });
}

export async function abrir(page, url) {
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 20_000 });
  } catch (causa) {
    fallar(
      `No se pudo abrir ${url}`,
      [
        '¿Está levantado el dev server?  cd frontend && pnpm run dev   (:5173)',
        '¿Y el backend?                  cd backend  && pnpm run start:dev  (:3000)',
        'Si el backend responde pero con datos viejos, mirá CLAUDE.md §11.7',
        '(proceso node huérfano aferrado al :3000 sirviendo un dist/ anterior).',
      ],
      causa,
    );
  }
}

export async function iniciarSesion(page, { baseUrl, email, password }) {
  await abrir(page, `${baseUrl}/login`);
  await page.fill('#email', email);
  await page.fill('#password', password);
  await page.click('button[type="submit"]');

  try {
    await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 15_000 });
  } catch (causa) {
    fallar(
      'El login no avanzó: seguimos en /login.',
      [
        `Usuario probado: ${email}`,
        'Causas habituales:',
        '  • La BD no tiene el usuario del seed → cd backend && pnpm run seed',
        '  • El backend no está levantado, o devuelve 401',
        '  • Las credenciales del smoke viven en OTRA organización (pediselas al dueño',
        '    del entorno en vez de crear datos por tu cuenta — §3.3 del doc).',
      ],
      causa,
    );
  }
}
