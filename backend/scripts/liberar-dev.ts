/**
 * Desaloja cualquier dev server de ESTE repo antes de levantar el watcher.
 *
 * Por qué existe (CLAUDE.md §11.7): dos sesiones de Claude Code lanzaron cada una su
 * propio `start:dev` en background (2026-07-30). Los dos watchers quedaron vivos
 * compilando al MISMO `dist/` y peleándose el `:3000`, y la app que servía el puerto
 * dejó de reflejar los últimos cambios sin dar un solo error visible.
 *
 * Por qué mata el ÁRBOL y no lo que escucha el puerto: un watcher solo le manda señales
 * a su propio hijo. Liberar el `:3000` mataría la app, pero el watcher rival la
 * relanzaría a los segundos — el arreglo aparente y el problema intacto. El fix del
 * PR #293 tampoco cubre este caso: hace que la app muera ante SIGTERM, no que un
 * watcher competidor deje de existir.
 */
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

export interface ProcesoListado {
  readonly pid: number;
  readonly ppid: number;
  readonly comando: string;
}

const NEST_CLI = '@nestjs/cli/bin/nest.js';

const esWatcherDelRepo = (comando: string, raizBackend: string): boolean =>
  comando.includes(raizBackend) && comando.includes(NEST_CLI) && comando.includes('--watch');

const esAppDelRepo = (comando: string, raizBackend: string): boolean =>
  comando.includes(`${raizBackend}/dist/main`);

const construirAncestros = (
  procesos: readonly ProcesoListado[],
  pidActual: number,
): ReadonlySet<number> => {
  const porPid = new Map(procesos.map((p) => [p.pid, p]));
  const ancestros = new Set<number>([pidActual]);

  let cursor = porPid.get(pidActual)?.ppid;
  while (cursor !== undefined && cursor > 1 && !ancestros.has(cursor)) {
    ancestros.add(cursor);
    cursor = porPid.get(cursor)?.ppid;
  }
  return ancestros;
};

const expandirDescendientes = (
  procesos: readonly ProcesoListado[],
  raices: readonly number[],
): ReadonlySet<number> => {
  const seleccionados = new Set<number>(raices);
  // Los hijos pueden aparecer antes que su padre en la salida de `ps`, así que se
  // repite el barrido hasta que deje de crecer.
  let crecio = true;
  while (crecio) {
    crecio = false;
    for (const proceso of procesos) {
      if (!seleccionados.has(proceso.pid) && seleccionados.has(proceso.ppid)) {
        seleccionados.add(proceso.pid);
        crecio = true;
      }
    }
  }
  return seleccionados;
};

/**
 * Decide qué PIDs desalojar.
 *
 * Nunca devuelve el proceso actual ni ninguno de sus ancestros: el `sh -c` que ejecuta
 * este script contiene el texto `nest start --watch` en su línea de comando, así que un
 * match por texto suelto se suicidaría. Por eso el criterio exige el binario real del
 * CLI de Nest y además excluye la cadena propia.
 */
export function seleccionarProcesosADesalojar(params: {
  readonly procesos: readonly ProcesoListado[];
  readonly raizBackend: string;
  readonly pidActual: number;
}): number[] {
  const { procesos, raizBackend, pidActual } = params;
  const ancestros = construirAncestros(procesos, pidActual);

  const candidatos = procesos
    .filter((p) => esWatcherDelRepo(p.comando, raizBackend) || esAppDelRepo(p.comando, raizBackend))
    .filter((p) => !ancestros.has(p.pid))
    .map((p) => p.pid);

  if (candidatos.length === 0) return [];

  return [...expandirDescendientes(procesos, candidatos)]
    .filter((pid) => !ancestros.has(pid))
    .sort((a, b) => a - b);
}

export function parsearPs(salida: string): ProcesoListado[] {
  return salida
    .split('\n')
    .map((linea) => /^\s*(\d+)\s+(\d+)\s+(.*)$/.exec(linea))
    .filter((match): match is RegExpExecArray => match !== null)
    .map((match) => ({
      pid: Number(match[1]),
      ppid: Number(match[2]),
      comando: match[3] ?? '',
    }));
}

const sigue = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

const señalar = (pid: number, señal: NodeJS.Signals): void => {
  try {
    process.kill(pid, señal);
  } catch {
    // Ya murió, o se lo llevó la caída de su padre. No es un error.
  }
};

const dormir = (milisegundos: number): void => {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milisegundos);
};

const esperarA = (pids: readonly number[], milisegundos: number): number[] => {
  const limite = Date.now() + milisegundos;
  let vivos = pids.filter(sigue);
  while (vivos.length > 0 && Date.now() < limite) {
    dormir(100);
    vivos = vivos.filter(sigue);
  }
  return vivos;
};

function main(): void {
  const raizBackend = resolve(__dirname, '..');
  const procesos = parsearPs(execFileSync('ps', ['-eo', 'pid=,ppid=,args='], { encoding: 'utf8' }));

  const aDesalojar = seleccionarProcesosADesalojar({
    procesos,
    raizBackend,
    pidActual: process.pid,
  });

  if (aDesalojar.length === 0) return;

  console.log(
    `[liberar-dev] desalojando ${aDesalojar.length} proceso(s) de un dev server previo: ${aDesalojar.join(', ')}`,
  );

  aDesalojar.forEach((pid) => señalar(pid, 'SIGTERM'));
  const tercos = esperarA(aDesalojar, 8000);

  if (tercos.length > 0) {
    console.log(`[liberar-dev] SIGKILL a los que no respondieron: ${tercos.join(', ')}`);
    tercos.forEach((pid) => señalar(pid, 'SIGKILL'));
    esperarA(tercos, 2000);
  }
}

if (require.main === module) {
  main();
}
