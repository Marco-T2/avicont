import { describe, expect, it } from 'vitest';

import {
  autoTildeFifo,
  resumenReparto,
  sugerirMontoParaFila,
  type FilaAplicacion,
} from './auto-tilde-fifo';
import { aCentavos } from './dinero-centavos';

// Escenario canónico de REQ-CXC-05: 01-jun (300), 15-jun (500), 01-jul (400).
const VENTAS_CANONICAS = [
  { ventaId: 'v-jun-01', saldoPendiente: '300.00', fechaContable: '2026-06-01' },
  { ventaId: 'v-jun-15', saldoPendiente: '500.00', fechaContable: '2026-06-15' },
  { ventaId: 'v-jul-01', saldoPendiente: '400.00', fechaContable: '2026-07-01' },
];

describe('autoTildeFifo', () => {
  it('escenario canónico de la spec: cobro de 600 → 300 a la 1ra y 300 a la 2da', () => {
    expect(autoTildeFifo(VENTAS_CANONICAS, '600')).toEqual([
      { ventaId: 'v-jun-01', tildada: true, montoAplicado: '300.00' },
      { ventaId: 'v-jun-15', tildada: true, montoAplicado: '300.00' },
      { ventaId: 'v-jul-01', tildada: false, montoAplicado: '' },
    ]);
  });

  // ============================================================
  // EL TEST QUE CONGELA REQ-CXC-05 / B-9: el orden canónico lo publica el
  // backend. El array de entrada CONTRADICE a propósito el orden por fecha
  // (la fila más nueva va primera): el auto-tilde DEBE seguir el orden del
  // array. Si alguien "arregla" el orden en el cliente (sort por
  // fechaContable), este test se pone rojo. NO lo cambies para que pase.
  // ============================================================
  it('respeta el orden del array aunque contradiga el orden por fecha (el backend manda)', () => {
    const ventasDesordenadasPorFecha = [
      { ventaId: 'v-nueva', saldoPendiente: '500.00', fechaContable: '2026-07-20' },
      { ventaId: 'v-vieja', saldoPendiente: '500.00', fechaContable: '2026-06-01' },
    ];

    expect(autoTildeFifo(ventasDesordenadasPorFecha, '500')).toEqual([
      // Primera del ARRAY (aunque su fecha sea la más nueva) recibe todo.
      { ventaId: 'v-nueva', tildada: true, montoAplicado: '500.00' },
      { ventaId: 'v-vieja', tildada: false, montoAplicado: '' },
    ]);
  });

  it('monto mayor a la suma de saldos: tilda todas al saldo completo y sobra queda sin asignar', () => {
    const filas = autoTildeFifo(VENTAS_CANONICAS, '2000');
    expect(filas).toEqual([
      { ventaId: 'v-jun-01', tildada: true, montoAplicado: '300.00' },
      { ventaId: 'v-jun-15', tildada: true, montoAplicado: '500.00' },
      { ventaId: 'v-jul-01', tildada: true, montoAplicado: '400.00' },
    ]);
    // El excedente colapsa a saldo a favor: 2000 − 1200 = 800.
    expect(resumenReparto('2000', filas).sinAplicar).toBe('800.00');
  });

  it('monto menor que el primer saldo: tilda solo la primera, parcial', () => {
    expect(autoTildeFifo(VENTAS_CANONICAS, '150.5')).toEqual([
      { ventaId: 'v-jun-01', tildada: true, montoAplicado: '150.50' },
      { ventaId: 'v-jun-15', tildada: false, montoAplicado: '' },
      { ventaId: 'v-jul-01', tildada: false, montoAplicado: '' },
    ]);
  });

  it('monto exacto a la suma de saldos: todas tildadas, cero sin aplicar', () => {
    const filas = autoTildeFifo(VENTAS_CANONICAS, '1200.00');
    expect(filas.every((f) => f.tildada)).toBe(true);
    expect(resumenReparto('1200.00', filas)).toEqual({
      totalAplicado: '1200.00',
      sinAplicar: '0.00',
      excedeMonto: false,
    });
  });

  it('monto cero, vacío o inválido: ninguna fila tildada', () => {
    for (const monto of ['0', '0.00', '', 'abc', '12.']) {
      const filas = autoTildeFifo(VENTAS_CANONICAS, monto);
      expect(filas.every((f) => !f.tildada && f.montoAplicado === '')).toBe(true);
    }
  });

  // MUTANTES (c): el reparto jamás excede ni el saldo por fila ni el monto.
  it('ninguna fila excede su saldo y la suma no excede el monto (aritmética en centavos)', () => {
    const ventas = [
      { ventaId: 'a', saldoPendiente: '0.10', fechaContable: '2026-06-01' },
      { ventaId: 'b', saldoPendiente: '0.20', fechaContable: '2026-06-02' },
      { ventaId: 'c', saldoPendiente: '0.30', fechaContable: '2026-06-03' },
    ];
    const filas = autoTildeFifo(ventas, '0.45');

    filas.forEach((fila, i) => {
      if (!fila.tildada) return;
      const saldo = aCentavos(ventas[i]!.saldoPendiente);
      expect(aCentavos(fila.montoAplicado) <= saldo).toBe(true);
    });
    const total = filas
      .filter((f) => f.tildada)
      .reduce((acc, f) => acc + aCentavos(f.montoAplicado), 0n);
    // 0.10 + 0.20 + 0.15 = 0.45 exacto — con parseFloat, 0.1+0.2 ya no da 0.3.
    expect(total).toBe(45n);
    expect(filas[2]).toEqual({ ventaId: 'c', tildada: true, montoAplicado: '0.15' });
  });

  it('no muta el array de ventas recibido (§2.4)', () => {
    const ventas = VENTAS_CANONICAS.map((v) => ({ ...v }));
    const copia = ventas.map((v) => ({ ...v }));
    autoTildeFifo(ventas, '600');
    expect(ventas).toEqual(copia);
  });
});

describe('resumenReparto', () => {
  const filas: FilaAplicacion[] = [
    { ventaId: 'a', tildada: true, montoAplicado: '300.00' },
    { ventaId: 'b', tildada: true, montoAplicado: '250.50' },
    { ventaId: 'c', tildada: false, montoAplicado: '' },
  ];

  it('suma solo las filas tildadas y deriva lo sin aplicar', () => {
    expect(resumenReparto('600', filas)).toEqual({
      totalAplicado: '550.50',
      sinAplicar: '49.50',
      excedeMonto: false,
    });
  });

  it('detecta cuando lo tildado excede el monto del cobro', () => {
    expect(resumenReparto('500', filas)).toEqual({
      totalAplicado: '550.50',
      sinAplicar: '0.00',
      excedeMonto: true,
    });
  });

  it('una fila tildada con monto a medio tipear cuenta 0, sin lanzar', () => {
    const conInvalida: FilaAplicacion[] = [
      { ventaId: 'a', tildada: true, montoAplicado: '12.' },
    ];
    expect(resumenReparto('600', conInvalida).totalAplicado).toBe('0.00');
  });
});

describe('sugerirMontoParaFila', () => {
  it('sugiere el mínimo entre el saldo de la venta y lo que queda del cobro', () => {
    const filas: FilaAplicacion[] = [
      { ventaId: 'a', tildada: true, montoAplicado: '300.00' },
    ];
    // Cobro 600, aplicado 300 → quedan 300; saldo de la fila 400 → sugiere 300.
    expect(sugerirMontoParaFila('600', filas, '400.00')).toBe('300.00');
    // Saldo 200 < resto 300 → sugiere el saldo.
    expect(sugerirMontoParaFila('600', filas, '200.00')).toBe('200.00');
  });

  it("devuelve '' cuando no queda nada por aplicar", () => {
    const filas: FilaAplicacion[] = [
      { ventaId: 'a', tildada: true, montoAplicado: '600.00' },
    ];
    expect(sugerirMontoParaFila('600', filas, '400.00')).toBe('');
  });
});
