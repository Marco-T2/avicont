import { ChildProcess, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createServer } from 'node:net';
import { join } from 'node:path';

/**
 * Regresión de CLAUDE.md §11.7: el proceso DEBE terminar ante un único SIGTERM.
 *
 * `otel-bootstrap` registraba `process.once('SIGTERM', …)` sin llamar a
 * `process.exit`. Registrar un handler suprime el comportamiento por defecto de
 * Node (terminar), y con el servidor HTTP todavía escuchando el event loop
 * nunca se vacía: el proceso sobrevivía a la señal y seguía respondiendo con el
 * código viejo en memoria. `nest start --watch` manda SIGTERM antes de
 * relanzar, así que TODO reinicio del watcher fallaba con EADDRINUSE.
 *
 * El test corre contra `dist/main.js` — el mismo binario que ejecutan el
 * watcher de dev y el contenedor — porque el bug vive en el arranque real del
 * proceso y no se reproduce con `Test.createTestingModule`.
 */
const RAIZ_BACKEND = join(__dirname, '..');
const DIST_MAIN = join(RAIZ_BACKEND, 'dist', 'main.js');

const PUERTO = 3998;
const TIMEOUT_ARRANQUE_MS = 60_000;
const TIMEOUT_APAGADO_MS = 15_000;

function esperarArranque(proceso: ChildProcess): Promise<void> {
  return new Promise((resolve, reject) => {
    let salida = '';

    const temporizador = setTimeout(() => {
      reject(new Error(`El proceso no arrancó en ${TIMEOUT_ARRANQUE_MS} ms. Salida:\n${salida}`));
    }, TIMEOUT_ARRANQUE_MS);

    const acumular = (chunk: Buffer): void => {
      salida += chunk.toString();
      if (salida.includes('API listening')) {
        clearTimeout(temporizador);
        resolve();
      }
    };

    proceso.stdout?.on('data', acumular);
    proceso.stderr?.on('data', acumular);

    proceso.once('exit', (code) => {
      clearTimeout(temporizador);
      reject(new Error(`El proceso murió durante el arranque (code ${code}). Salida:\n${salida}`));
    });
  });
}

function esperarSalida(proceso: ChildProcess, timeoutMs: number): Promise<number | null> {
  return new Promise((resolve, reject) => {
    const temporizador = setTimeout(() => {
      reject(
        new Error(
          `El proceso sigue vivo ${timeoutMs} ms después del SIGTERM. ` +
            'Alguien registró un handler de señal que no termina el proceso (ver §11.7).',
        ),
      );
    }, timeoutMs);

    proceso.once('exit', (code) => {
      clearTimeout(temporizador);
      resolve(code);
    });
  });
}

function puertoLibre(puerto: number): Promise<boolean> {
  return new Promise((resolve) => {
    const servidor = createServer();
    servidor.once('error', () => resolve(false));
    servidor.once('listening', () => servidor.close(() => resolve(true)));
    servidor.listen(puerto);
  });
}

describe('Apagado del proceso (e2e)', () => {
  let proceso: ChildProcess | undefined;

  beforeAll(() => {
    if (!existsSync(DIST_MAIN)) {
      throw new Error(
        `Falta ${DIST_MAIN}. Este test corre contra el binario compilado: ejecutá "pnpm run build" antes.`,
      );
    }
  });

  afterEach(() => {
    // Red de seguridad: si el test falla, no dejamos el proceso aferrado al puerto.
    if (proceso && proceso.exitCode === null && proceso.signalCode === null) {
      proceso.kill('SIGKILL');
    }
    proceso = undefined;
  });

  it('termina ante un único SIGTERM y libera el puerto', async () => {
    proceso = spawn(process.execPath, [DIST_MAIN], {
      cwd: RAIZ_BACKEND,
      env: {
        ...process.env,
        PORT: String(PUERTO),
        // El escenario del bug: tracing activo. Y el collector deliberadamente
        // inalcanzable, que es lo normal en dev (`tempo` sólo resuelve dentro
        // de la red de Docker Compose) — el apagado no debe quedar esperándolo.
        TRACING_ENABLED: 'true',
        OTEL_EXPORTER_OTLP_ENDPOINT: 'http://127.0.0.1:4318',
      },
    });

    await esperarArranque(proceso);

    const salida = esperarSalida(proceso, TIMEOUT_APAGADO_MS);
    proceso.kill('SIGTERM');

    // Código 0 y no `null`: `null` significaría que lo terminó la señal sin
    // pasar por el handler, y ahí nos habríamos quedado sin el cierre ordenado
    // (`app.close()` → `PrismaService.onModuleDestroy` → `$disconnect`).
    await expect(salida).resolves.toBe(0);
    await expect(puertoLibre(PUERTO)).resolves.toBe(true);
  }, 90_000);
});
