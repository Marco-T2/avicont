import { describe, expect, it } from 'vitest';

import type { LineaConciliacion, SugerenciaConciliacion } from '@/types/api';

import { claveLinea, indexarLineas, ordenarSugerencias } from './sugerencias';

function linea(overrides: Partial<LineaConciliacion> = {}): LineaConciliacion {
  return {
    comprobanteId: 'comp-1',
    orden: 1,
    fecha: '2026-06-10',
    numeroComprobante: 'D2606-000001',
    glosa: 'Depósito de cliente',
    glosaLinea: null,
    monto: '1500.00',
    montoBob: '1500.00',
    tipo: 'DEBITO',
    moneda: 'BOB',
    estadoEfectivo: 'EN_TRANSITO',
    ...overrides,
  };
}

function sugerencia(overrides: Partial<SugerenciaConciliacion> = {}): SugerenciaConciliacion {
  return {
    movimientoId: 'mov-1',
    comprobanteId: 'comp-1',
    orden: 1,
    confianza: 'ALTA',
    diferenciaDias: 0,
    ...overrides,
  };
}

describe('claveLinea — key estable de lista (Anti-F-06)', () => {
  it('compone la clave con comprobanteId y orden', () => {
    expect(claveLinea('comp-abc', 3)).toBe('comp-abc#3');
  });

  it('dos líneas del mismo comprobante en distinto orden producen claves distintas', () => {
    expect(claveLinea('comp-abc', 3)).not.toBe(claveLinea('comp-abc', 4));
  });

  it('el mismo orden en comprobantes distintos produce claves distintas', () => {
    expect(claveLinea('comp-a', 1)).not.toBe(claveLinea('comp-b', 1));
  });
});

describe('indexarLineas — lookup del ancla (comprobanteId, orden)', () => {
  it('permite recuperar la línea por su clave de ancla', () => {
    const l1 = linea({ comprobanteId: 'comp-1', orden: 1, monto: '100.00' });
    const l2 = linea({ comprobanteId: 'comp-1', orden: 2, monto: '250.00' });

    const indice = indexarLineas([l1, l2]);

    expect(indice.get(claveLinea('comp-1', 2))?.monto).toBe('250.00');
  });

  it('devuelve undefined cuando el ancla no está en el rango consultado', () => {
    const indice = indexarLineas([linea({ comprobanteId: 'comp-1', orden: 1 })]);

    expect(indice.get(claveLinea('comp-9', 9))).toBeUndefined();
  });

  it('indexa todas las líneas recibidas', () => {
    const indice = indexarLineas([
      linea({ comprobanteId: 'comp-1', orden: 1 }),
      linea({ comprobanteId: 'comp-1', orden: 2 }),
      linea({ comprobanteId: 'comp-2', orden: 1 }),
    ]);

    expect(indice.size).toBe(3);
  });
});

describe('ordenarSugerencias — REQ-CB-12, ranking por confianza', () => {
  it('ordena ALTA antes que MEDIA y MEDIA antes que BAJA', () => {
    const entrada = [
      sugerencia({ movimientoId: 'mov-baja', confianza: 'BAJA' }),
      sugerencia({ movimientoId: 'mov-media', confianza: 'MEDIA' }),
      sugerencia({ movimientoId: 'mov-alta', confianza: 'ALTA' }),
    ];

    const ordenadas = ordenarSugerencias(entrada);

    expect(ordenadas.map((s) => s.movimientoId)).toEqual([
      'mov-alta',
      'mov-media',
      'mov-baja',
    ]);
  });

  it('a igual confianza, prioriza la menor diferencia de días', () => {
    const entrada = [
      sugerencia({ movimientoId: 'mov-3d', confianza: 'MEDIA', diferenciaDias: 3 }),
      sugerencia({ movimientoId: 'mov-1d', confianza: 'MEDIA', diferenciaDias: 1 }),
      sugerencia({ movimientoId: 'mov-2d', confianza: 'MEDIA', diferenciaDias: 2 }),
    ];

    const ordenadas = ordenarSugerencias(entrada);

    expect(ordenadas.map((s) => s.movimientoId)).toEqual(['mov-1d', 'mov-2d', 'mov-3d']);
  });

  it('no muta el array recibido (CLAUDE.md §2.4)', () => {
    const entrada = [
      sugerencia({ movimientoId: 'mov-baja', confianza: 'BAJA' }),
      sugerencia({ movimientoId: 'mov-alta', confianza: 'ALTA' }),
    ];

    ordenarSugerencias(entrada);

    expect(entrada.map((s) => s.movimientoId)).toEqual(['mov-baja', 'mov-alta']);
  });

  it('devuelve una lista vacía cuando no hay sugerencias', () => {
    expect(ordenarSugerencias([])).toEqual([]);
  });
});
