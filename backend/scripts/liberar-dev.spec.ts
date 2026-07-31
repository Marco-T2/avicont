import { ProcesoListado, parsearPs, seleccionarProcesosADesalojar } from './liberar-dev';

const RAIZ = '/home/marko/proyectos/avicont/backend';
const OTRO_REPO = '/home/marko/proyectos/otro/backend';

const watcher = (raiz: string): string =>
  `node ${raiz}/node_modules/.bin/../@nestjs/cli/bin/nest.js start --watch --path tsconfig.build.json`;

const app = (raiz: string): string => `node --enable-source-maps ${raiz}/dist/main`;

describe('seleccionarProcesosADesalojar', () => {
  it('no devuelve nada cuando no hay dev servers vivos', () => {
    const procesos: ProcesoListado[] = [{ pid: 500, ppid: 1, comando: 'node /otra/cosa.js' }];

    expect(seleccionarProcesosADesalojar({ procesos, raizBackend: RAIZ, pidActual: 500 })).toEqual(
      [],
    );
  });

  it('desaloja un watcher del repo junto con toda su descendencia', () => {
    const procesos: ProcesoListado[] = [
      { pid: 100, ppid: 1, comando: watcher(RAIZ) },
      { pid: 101, ppid: 100, comando: `sh -c ${app(RAIZ)}` },
      { pid: 102, ppid: 101, comando: app(RAIZ) },
      { pid: 900, ppid: 1, comando: 'node scripts/liberar-dev.ts' },
    ];

    expect(seleccionarProcesosADesalojar({ procesos, raizBackend: RAIZ, pidActual: 900 })).toEqual([
      100, 101, 102,
    ]);
  });

  it('desaloja los DOS watchers cuando conviven (el caso del 2026-07-30)', () => {
    const procesos: ProcesoListado[] = [
      { pid: 100, ppid: 1, comando: watcher(RAIZ) },
      { pid: 200, ppid: 1, comando: watcher(RAIZ) },
      { pid: 201, ppid: 200, comando: app(RAIZ) },
      { pid: 900, ppid: 1, comando: 'node scripts/liberar-dev.ts' },
    ];

    expect(seleccionarProcesosADesalojar({ procesos, raizBackend: RAIZ, pidActual: 900 })).toEqual([
      100, 200, 201,
    ]);
  });

  it('el criterio ignora el `sh -c` propio, que lleva "nest start --watch" en su texto', () => {
    // Primera línea de defensa: exigir el binario real del CLI de Nest. La línea de
    // comando del `sh -c` que lanza este script contiene el texto suelto, así que un
    // match laxo mataría al padre y el watcher nuevo jamás llegaría a arrancar.
    const procesos: ProcesoListado[] = [
      { pid: 10, ppid: 1, comando: 'bash' },
      { pid: 11, ppid: 10, comando: 'node .../pnpm run start:dev' },
      {
        pid: 12,
        ppid: 11,
        comando: `sh -c cd ${RAIZ} && ts-node scripts/liberar-dev.ts && nest start --watch`,
      },
      { pid: 13, ppid: 12, comando: 'node scripts/liberar-dev.ts' },
    ];

    expect(seleccionarProcesosADesalojar({ procesos, raizBackend: RAIZ, pidActual: 13 })).toEqual(
      [],
    );
  });

  it('NUNCA se suicida: aun cumpliendo el criterio, un ancestro queda excluido', () => {
    // Segunda línea de defensa, independiente de la primera: si el criterio llegara a
    // coincidir con un ancestro, matarlo derribaría la cadena que ejecuta este script.
    const procesos: ProcesoListado[] = [
      { pid: 20, ppid: 1, comando: watcher(RAIZ) },
      { pid: 21, ppid: 20, comando: 'node scripts/liberar-dev.ts' },
    ];

    expect(seleccionarProcesosADesalojar({ procesos, raizBackend: RAIZ, pidActual: 21 })).toEqual(
      [],
    );
  });

  it('no toca un `tsc --watch` del mismo repo', () => {
    // Su binario vive bajo node_modules/, así que su línea de comando contiene la raíz
    // del backend Y la bandera --watch. Sin exigir el binario del CLI de Nest, un
    // typecheck en watch se llevaría un SIGKILL por parecerse al dev server.
    const procesos: ProcesoListado[] = [
      {
        pid: 700,
        ppid: 1,
        comando: `node ${RAIZ}/node_modules/typescript/bin/tsc --watch --noEmit`,
      },
      { pid: 900, ppid: 1, comando: 'node scripts/liberar-dev.ts' },
    ];

    expect(seleccionarProcesosADesalojar({ procesos, raizBackend: RAIZ, pidActual: 900 })).toEqual(
      [],
    );
  });

  it('no toca el dev server de otro repositorio', () => {
    const procesos: ProcesoListado[] = [
      { pid: 300, ppid: 1, comando: watcher(OTRO_REPO) },
      { pid: 301, ppid: 300, comando: app(OTRO_REPO) },
      { pid: 900, ppid: 1, comando: 'node scripts/liberar-dev.ts' },
    ];

    expect(seleccionarProcesosADesalojar({ procesos, raizBackend: RAIZ, pidActual: 900 })).toEqual(
      [],
    );
  });

  it('desaloja una app huérfana aunque su watcher ya no exista', () => {
    const procesos: ProcesoListado[] = [
      { pid: 400, ppid: 1, comando: app(RAIZ) },
      { pid: 900, ppid: 1, comando: 'node scripts/liberar-dev.ts' },
    ];

    expect(seleccionarProcesosADesalojar({ procesos, raizBackend: RAIZ, pidActual: 900 })).toEqual([
      400,
    ]);
  });

  it('alcanza a los hijos aunque `ps` los liste antes que su padre', () => {
    const procesos: ProcesoListado[] = [
      { pid: 102, ppid: 101, comando: app(RAIZ) },
      { pid: 101, ppid: 100, comando: 'sh -c node dist/main' },
      { pid: 100, ppid: 1, comando: watcher(RAIZ) },
      { pid: 900, ppid: 1, comando: 'node scripts/liberar-dev.ts' },
    ];

    expect(seleccionarProcesosADesalojar({ procesos, raizBackend: RAIZ, pidActual: 900 })).toEqual([
      100, 101, 102,
    ]);
  });
});

describe('parsearPs', () => {
  it('parsea la salida de `ps -eo pid=,ppid=,args=`', () => {
    const salida = [
      '  100     1 node /repo/nest.js start --watch',
      ' 1023   100 node --enable-source-maps /repo/dist/main',
      '',
    ].join('\n');

    expect(parsearPs(salida)).toEqual([
      { pid: 100, ppid: 1, comando: 'node /repo/nest.js start --watch' },
      {
        pid: 1023,
        ppid: 100,
        comando: 'node --enable-source-maps /repo/dist/main',
      },
    ]);
  });

  it('descarta líneas que no son procesos', () => {
    expect(parsearPs('PID PPID COMMAND\n\n  basura sin pid\n')).toEqual([]);
  });
});
