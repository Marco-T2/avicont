import { Money } from '@/common/domain/money';

import { type AplicacionParaRecorte, recortarAplicacionesLifo } from './recorte-aplicaciones';

function app(id: string, cobroId: string, monto: string): AplicacionParaRecorte {
  return { id, cobroId, montoAplicado: Money.of(monto) };
}

describe('recortarAplicacionesLifo (D-21, REQ-VTA-06)', () => {
  // El orden de entrada ES el orden LIFO: la más reciente primero, tal como
  // lo entrega `listarAplicaciones` (createdAt desc, id desc).
  const APP_COBRO_2 = app('app-2', 'cobro-2', '500'); // la más reciente
  const APP_COBRO_1 = app('app-1', 'cobro-1', '500');

  describe('escenario de la spec: venta de 1.000 con dos cobros de 500', () => {
    it('bajar a 800 recorta SOLO la aplicación más reciente (Cobro 2) a 300 y deja la del Cobro 1 intacta', () => {
      const plan = recortarAplicacionesLifo([APP_COBRO_2, APP_COBRO_1], Money.of('800'));

      expect(plan.parciales).toHaveLength(1);
      expect(plan.parciales[0]?.aplicacion.id).toBe('app-2');
      expect(plan.parciales[0]?.montoNuevo.toString()).toBe('300');
      expect(plan.eliminadas).toHaveLength(0);
    });

    it('bajar a 300 atraviesa en CASCADA: elimina la del Cobro 2 y recorta la del Cobro 1 a 300', () => {
      // Discriminante LIFO vs FIFO: un FIFO eliminaría app-1 y recortaría
      // app-2 — exactamente al revés. Con un solo cobro este test no
      // distinguiría nada.
      const plan = recortarAplicacionesLifo([APP_COBRO_2, APP_COBRO_1], Money.of('300'));

      expect(plan.eliminadas.map((a) => a.id)).toEqual(['app-2']);
      expect(plan.parciales).toHaveLength(1);
      expect(plan.parciales[0]?.aplicacion.id).toBe('app-1');
      expect(plan.parciales[0]?.montoNuevo.toString()).toBe('300');
    });
  });

  it('el exceso EXACTO al monto de la más reciente la elimina sin tocar la anterior', () => {
    const plan = recortarAplicacionesLifo([APP_COBRO_2, APP_COBRO_1], Money.of('500'));

    expect(plan.eliminadas.map((a) => a.id)).toEqual(['app-2']);
    expect(plan.parciales).toHaveLength(0);
  });

  it('bajar a 0 elimina TODAS las aplicaciones', () => {
    const plan = recortarAplicacionesLifo([APP_COBRO_2, APP_COBRO_1], Money.ZERO);

    expect(plan.eliminadas.map((a) => a.id)).toEqual(['app-2', 'app-1']);
    expect(plan.parciales).toHaveLength(0);
  });

  it('nuevo total IGUAL a lo aplicado → plan vacío (matriz: nada que tocar)', () => {
    const plan = recortarAplicacionesLifo([APP_COBRO_2, APP_COBRO_1], Money.of('1000'));

    expect(plan.parciales).toHaveLength(0);
    expect(plan.eliminadas).toHaveLength(0);
  });

  it('subir el monto → plan vacío (el saldo pendiente crece solo, es derivado)', () => {
    const plan = recortarAplicacionesLifo([APP_COBRO_2, APP_COBRO_1], Money.of('1500'));

    expect(plan.parciales).toHaveLength(0);
    expect(plan.eliminadas).toHaveLength(0);
  });

  it('sin aplicaciones → plan vacío', () => {
    const plan = recortarAplicacionesLifo([], Money.of('100'));

    expect(plan.parciales).toHaveLength(0);
    expect(plan.eliminadas).toHaveLength(0);
  });

  it('cascada de TRES aplicaciones: elimina dos y recorta la tercera', () => {
    const apps = [app('app-3', 'cobro-3', '200'), APP_COBRO_2, APP_COBRO_1];
    // Aplicado 1.200, nuevo total 250 → exceso 950: 200 + 500 eliminadas,
    // la más antigua queda en 250.
    const plan = recortarAplicacionesLifo(apps, Money.of('250'));

    expect(plan.eliminadas.map((a) => a.id)).toEqual(['app-3', 'app-2']);
    expect(plan.parciales[0]?.aplicacion.id).toBe('app-1');
    expect(plan.parciales[0]?.montoNuevo.toString()).toBe('250');
  });

  it('opera con centavos exactos, sin redondeo propio (§4.5)', () => {
    const apps = [app('app-2', 'cobro-2', '100.05'), app('app-1', 'cobro-1', '99.95')];
    const plan = recortarAplicacionesLifo(apps, Money.of('150.03'));

    // Exceso 49.97: recorta la más reciente a 50.08.
    expect(plan.parciales[0]?.aplicacion.id).toBe('app-2');
    expect(plan.parciales[0]?.montoNuevo.toString()).toBe('50.08');
    expect(plan.eliminadas).toHaveLength(0);
  });

  it('no muta la lista recibida ni sus elementos (§2.4)', () => {
    const apps = [app('app-2', 'cobro-2', '500'), app('app-1', 'cobro-1', '500')];
    const copia = apps.map((a) => ({ ...a }));

    recortarAplicacionesLifo(apps, Money.of('300'));

    expect(apps.map((a) => a.montoAplicado.toString())).toEqual(
      copia.map((a) => a.montoAplicado.toString()),
    );
    expect(apps.map((a) => a.id)).toEqual(copia.map((a) => a.id));
  });
});
