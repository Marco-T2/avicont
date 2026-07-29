import { waitForRow, waitForRows } from './wait-for';

/**
 * Unit puro, sin BD ni NestJS: el helper se prueba con un `find` falso que
 * simula "la escritura asíncrona todavía no aterrizó".
 *
 * Esto es lo que hace verificable un arreglo de flake: el defecto real es
 * no-determinístico (depende de la carga del runner), pero la conducta del
 * helper —reintentar hasta N veces y no antes— sí se puede fijar.
 */
describe('waitForRow', () => {
  it('devuelve la fila apenas aparece, sin agotar los intentos', async () => {
    let llamadas = 0;
    const find = jest.fn(async () => {
      llamadas++;
      return llamadas >= 3 ? { id: 'audit-1' } : null;
    });

    const fila = await waitForRow(find, { attempts: 50, intervalMs: 1 });

    expect(fila).toEqual({ id: 'audit-1' });
    expect(find).toHaveBeenCalledTimes(3);
  });

  it('no espera de más cuando la fila ya está en el primer intento', async () => {
    const find = jest.fn(async () => ({ id: 'audit-1' }));

    const fila = await waitForRow(find, { attempts: 50, intervalMs: 1 });

    expect(fila).toEqual({ id: 'audit-1' });
    expect(find).toHaveBeenCalledTimes(1);
  });

  it('devuelve null al agotar los intentos, sin lanzar', async () => {
    const find = jest.fn(async () => null);

    // El contrato es NO lanzar: quien tiene que fallar es el `expect` del test
    // que llama, con su mensaje original.
    const fila = await waitForRow(find, { attempts: 4, intervalMs: 1 });

    expect(fila).toBeNull();
    expect(find).toHaveBeenCalledTimes(4);
  });

  it('trata `undefined` como "todavía no está"', async () => {
    let llamadas = 0;
    const find = jest.fn(async () => {
      llamadas++;
      return llamadas >= 2 ? { id: 'audit-1' } : undefined;
    });

    const fila = await waitForRow(find as () => Promise<{ id: string } | null>, {
      attempts: 10,
      intervalMs: 1,
    });

    expect(fila).toEqual({ id: 'audit-1' });
    expect(find).toHaveBeenCalledTimes(2);
  });
});

describe('waitForRows', () => {
  it('espera hasta alcanzar el mínimo de filas', async () => {
    let llamadas = 0;
    const find = jest.fn(async () => {
      llamadas++;
      return llamadas >= 3 ? [{ id: 'a' }, { id: 'b' }] : [{ id: 'a' }];
    });

    const filas = await waitForRows(find, 2, { attempts: 50, intervalMs: 1 });

    expect(filas).toHaveLength(2);
    expect(find).toHaveBeenCalledTimes(3);
  });

  it('al agotar los intentos devuelve el ÚLTIMO resultado, no un array vacío', async () => {
    const find = jest.fn(async () => [{ id: 'a' }]);

    const filas = await waitForRows(find, 3, { attempts: 4, intervalMs: 1 });

    // Devolver [] escondería cuántas filas llegaron de verdad y haría que el
    // `expect(...).toHaveLength(3)` del test mienta sobre la causa.
    expect(filas).toHaveLength(1);
    expect(find).toHaveBeenCalledTimes(4);
  });
});
