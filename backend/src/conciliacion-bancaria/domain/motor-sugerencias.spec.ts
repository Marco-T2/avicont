import { FechaContable } from '@/common/domain/fecha-contable';
import { Money } from '@/common/domain/money';

import { sugerir } from './motor-sugerencias';
import type { LineaCandidata, MovimientoPendiente } from './motor-sugerencias';

function movimiento(overrides: Partial<MovimientoPendiente> = {}): MovimientoPendiente {
  return {
    id: 'mov-1',
    fecha: FechaContable.fromIso('2026-06-10'),
    monto: Money.of('100.00'),
    tipo: 'CREDITO', // banco: entra plata → espera DEBITO contable
    moneda: 'BOB',
    ...overrides,
  };
}

function linea(overrides: Partial<LineaCandidata> = {}): LineaCandidata {
  return {
    comprobanteId: 'comp-1',
    orden: 1,
    fecha: FechaContable.fromIso('2026-06-10'),
    monto: Money.of('100.00'),
    tipo: 'DEBITO', // contrapartida correcta de un CREDITO bancario
    moneda: 'BOB',
    ...overrides,
  };
}

describe('sugerir (motor de sugerencias, REQ-CB-12, design §5.2)', () => {
  it('monto y fecha exactos, candidato único en ambas direcciones — confianza ALTA', () => {
    const resultado = sugerir([movimiento()], [linea()]);
    expect(resultado).toHaveLength(1);
    expect(resultado[0]).toMatchObject({
      movimientoId: 'mov-1',
      comprobanteId: 'comp-1',
      orden: 1,
      confianza: 'ALTA',
      diferenciaDias: 0,
    });
  });

  it('monto exacto, fecha dentro de la ventana ±3 días — confianza MEDIA', () => {
    const resultado = sugerir(
      [movimiento({ fecha: FechaContable.fromIso('2026-06-10') })],
      [linea({ fecha: FechaContable.fromIso('2026-06-12') })], // 2 días de diferencia
    );
    expect(resultado).toHaveLength(1);
    expect(resultado[0]?.confianza).toBe('MEDIA');
    expect(resultado[0]?.diferenciaDias).toBe(2);
  });

  it('fuera de la ventana ±3 días — sin sugerencia (par no elegible)', () => {
    const resultado = sugerir(
      [movimiento({ fecha: FechaContable.fromIso('2026-06-10') })],
      [linea({ fecha: FechaContable.fromIso('2026-06-15') })], // 5 días
    );
    expect(resultado).toHaveLength(0);
  });

  it('monto exacto, varios candidatos ambiguos — confianza BAJA para los 3, sin preseleccionar ninguno', () => {
    const resultado = sugerir(
      [movimiento()],
      [
        linea({ comprobanteId: 'comp-A', orden: 1 }),
        linea({ comprobanteId: 'comp-B', orden: 1 }),
        linea({ comprobanteId: 'comp-C', orden: 1 }),
      ],
    );
    expect(resultado).toHaveLength(3);
    expect(resultado.every((s) => s.confianza === 'BAJA')).toBe(true);
  });

  it('unicidad en AMBAS direcciones para ALTA — un movimiento con 2 candidatos degrada a BAJA aunque uno sea fecha exacta', () => {
    const resultado = sugerir(
      [movimiento()],
      [
        linea({ comprobanteId: 'comp-A', fecha: FechaContable.fromIso('2026-06-10') }), // exacto
        linea({ comprobanteId: 'comp-B', fecha: FechaContable.fromIso('2026-06-11') }), // ±1 día
      ],
    );
    expect(resultado).toHaveLength(2);
    expect(resultado.every((s) => s.confianza === 'BAJA')).toBe(true);
  });

  it('unicidad en AMBAS direcciones — una línea reclamada por 2 movimientos degrada ambos pares a BAJA', () => {
    const lineaUnica = linea();
    const resultado = sugerir(
      [movimiento({ id: 'mov-A' }), movimiento({ id: 'mov-B' })],
      [lineaUnica],
    );
    expect(resultado).toHaveLength(2);
    expect(resultado.every((s) => s.confianza === 'BAJA')).toBe(true);
  });

  it('nunca produce un MatchConciliacion — solo devuelve la lista ranqueada (sin efectos, sin auto-confirmación)', () => {
    const resultado = sugerir([movimiento()], [linea()]);
    // El resultado es data plana — no hay ningún método de "confirmar" ni
    // efecto lateral posible desde acá. Verificamos la forma del contrato.
    expect(resultado[0]).not.toHaveProperty('confirmar');
    expect(typeof resultado[0]?.confianza).toBe('string');
  });

  describe('filtros de elegibilidad', () => {
    it('descarta pares de distinta moneda', () => {
      const resultado = sugerir([movimiento({ moneda: 'BOB' })], [linea({ moneda: 'USD' })]);
      expect(resultado).toHaveLength(0);
    });

    it('usa ladoContableEsperado — un CREDITO bancario NO matchea contra una línea CREDITO (inversión banco↔empresa)', () => {
      const resultado = sugerir(
        [movimiento({ tipo: 'CREDITO' })],
        [linea({ tipo: 'CREDITO' })], // debería ser DEBITO para matchear
      );
      expect(resultado).toHaveLength(0);
    });

    it('un DEBITO bancario matchea contra una línea CREDITO contable', () => {
      const resultado = sugerir([movimiento({ tipo: 'DEBITO' })], [linea({ tipo: 'CREDITO' })]);
      expect(resultado).toHaveLength(1);
      expect(resultado[0]?.confianza).toBe('ALTA');
    });

    it('descarta pares con monto fuera de tolerancia', () => {
      const resultado = sugerir(
        [movimiento({ monto: Money.of('100.00') })],
        [linea({ monto: Money.of('150.00') })],
      );
      expect(resultado).toHaveLength(0);
    });

    it('acepta monto dentro de tolerancia ±0.01', () => {
      const resultado = sugerir(
        [movimiento({ monto: Money.of('100.00') })],
        [linea({ monto: Money.of('100.01') })],
      );
      expect(resultado).toHaveLength(1);
    });
  });

  describe('orden de salida determinístico', () => {
    it('confianza DESC → |diferenciaDias| ASC → comprobanteId ASC → orden ASC, independiente del orden de entrada', () => {
      const movAlta = movimiento({ id: 'mov-alta', fecha: FechaContable.fromIso('2026-06-10') });
      const lineaAlta = linea({
        comprobanteId: 'comp-alta',
        fecha: FechaContable.fromIso('2026-06-10'),
      });

      const movMediaLejos = movimiento({ id: 'mov-media-3', monto: Money.of('50.00') });
      const lineaMediaLejos = linea({
        comprobanteId: 'comp-media-3',
        monto: Money.of('50.00'),
        fecha: FechaContable.fromIso('2026-06-13'), // 3 días
      });

      const movMediaCerca = movimiento({ id: 'mov-media-1', monto: Money.of('75.00') });
      const lineaMediaCerca = linea({
        comprobanteId: 'comp-media-1',
        monto: Money.of('75.00'),
        fecha: FechaContable.fromIso('2026-06-11'), // 1 día
      });

      const entrada1 = {
        movs: [movMediaLejos, movAlta, movMediaCerca],
        lineas: [lineaMediaLejos, lineaAlta, lineaMediaCerca],
      };
      const entrada2 = {
        movs: [movMediaCerca, movMediaLejos, movAlta],
        lineas: [lineaAlta, lineaMediaCerca, lineaMediaLejos],
      };

      const resultado1 = sugerir(entrada1.movs, entrada1.lineas);
      const resultado2 = sugerir(entrada2.movs, entrada2.lineas);

      const idsOrdenados = resultado1.map((s) => s.movimientoId);
      expect(idsOrdenados).toEqual(['mov-alta', 'mov-media-1', 'mov-media-3']);
      expect(resultado2.map((s) => s.movimientoId)).toEqual(idsOrdenados);
    });

    it('a igual confianza y diferenciaDias, desempata por comprobanteId ASC', () => {
      const mov = movimiento();
      const resultado = sugerir(
        [mov],
        [linea({ comprobanteId: 'comp-Z' }), linea({ comprobanteId: 'comp-A' })],
      );
      expect(resultado.map((s) => s.comprobanteId)).toEqual(['comp-A', 'comp-Z']);
    });

    it('a igual todo lo anterior, desempata por orden ASC', () => {
      const mov = movimiento();
      const resultado = sugerir(
        [mov],
        [
          linea({ comprobanteId: 'comp-1', orden: 3 }),
          linea({ comprobanteId: 'comp-1', orden: 1 }),
        ],
      );
      expect(resultado.map((s) => s.orden)).toEqual([1, 3]);
    });
  });

  it('sin movimientos o sin líneas → lista vacía', () => {
    expect(sugerir([], [linea()])).toEqual([]);
    expect(sugerir([movimiento()], [])).toEqual([]);
    expect(sugerir([], [])).toEqual([]);
  });
});
