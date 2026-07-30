import { describe, expect, it } from 'vitest';

import {
  describirItemsBloqueantes,
  itemsBloqueantes,
  type ItemBloqueante,
} from './error-messages';

// Shape REAL de axios: el GlobalExceptionFilter envuelve todo bajo `error`.
function err(details?: Record<string, unknown>): unknown {
  return {
    response: {
      data: {
        error: {
          code: 'CUENTA_REFERENCIADA_POR_ITEMS',
          message: 'La cuenta está asignada como cuenta de ingreso de ítems activos',
          ...(details !== undefined ? { details } : {}),
        },
      },
    },
  };
}

const POLLO: ItemBloqueante = { id: 'a1', nombre: 'Pollo entero', codigo: 'PE-001' };
const FAENADO: ItemBloqueante = { id: 'b2', nombre: 'Servicio de faenado', codigo: null };

describe('itemsBloqueantes', () => {
  it('extrae los ítems que manda el backend en details.items', () => {
    expect(itemsBloqueantes(err({ cuentaId: 'c9', items: [POLLO, FAENADO] }))).toEqual([
      POLLO,
      FAENADO,
    ]);
  });

  it('acepta el ítem sin código (el código es opcional — REQ-ITM-02)', () => {
    expect(itemsBloqueantes(err({ items: [FAENADO] }))).toEqual([FAENADO]);
  });

  it('devuelve vacío cuando el error no trae details', () => {
    expect(itemsBloqueantes(err())).toEqual([]);
  });

  it('devuelve vacío ante un payload que no es array', () => {
    expect(itemsBloqueantes(err({ items: 'PE-001' }))).toEqual([]);
  });

  it('descarta entradas con forma inesperada sin romper', () => {
    const items = itemsBloqueantes(err({ items: [POLLO, null, 42, { nombre: 'sin id' }] }));
    expect(items).toEqual([POLLO]);
  });

  it('no explota con un error que no es de axios', () => {
    expect(itemsBloqueantes(new Error('boom'))).toEqual([]);
    expect(itemsBloqueantes(undefined)).toEqual([]);
  });
});

describe('describirItemsBloqueantes', () => {
  it('antepone el código cuando existe', () => {
    expect(describirItemsBloqueantes([POLLO])).toBe('PE-001 — Pollo entero');
  });

  it('usa solo el nombre cuando el ítem no tiene código', () => {
    expect(describirItemsBloqueantes([FAENADO])).toBe('Servicio de faenado');
  });

  it('separa varios con coma', () => {
    expect(describirItemsBloqueantes([POLLO, FAENADO])).toBe(
      'PE-001 — Pollo entero, Servicio de faenado',
    );
  });

  // Un toast con 40 ítems tapa la pantalla y deja de informar.
  it('acota al tope y dice cuántos quedaron afuera', () => {
    const muchos = Array.from({ length: 8 }, (_, i) => ({
      id: `id-${i}`,
      nombre: `Ítem ${i}`,
      codigo: null,
    }));
    expect(describirItemsBloqueantes(muchos, 5)).toBe(
      'Ítem 0, Ítem 1, Ítem 2, Ítem 3, Ítem 4 y 3 más',
    );
  });

  it('no agrega el sufijo cuando entran todos justo en el tope', () => {
    const cinco = Array.from({ length: 5 }, (_, i) => ({
      id: `id-${i}`,
      nombre: `Ítem ${i}`,
      codigo: null,
    }));
    expect(describirItemsBloqueantes(cinco, 5)).toBe('Ítem 0, Ítem 1, Ítem 2, Ítem 3, Ítem 4');
  });
});
