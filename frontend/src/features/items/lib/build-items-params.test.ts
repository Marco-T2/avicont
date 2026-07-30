import { describe, expect, it } from 'vitest';

import { buildItemsParams, PAGE_SIZE } from './build-items-params';

describe('buildItemsParams', () => {
  it('estado "activos" + tipo "todos" + q vacío → solo page y pageSize', () => {
    expect(buildItemsParams('todos', 'activos', '', 1)).toEqual({
      page: 1,
      pageSize: PAGE_SIZE,
    });
  });

  it('tipo "PRODUCTO" → agrega tipo', () => {
    expect(buildItemsParams('PRODUCTO', 'activos', '', 1)).toEqual({
      tipo: 'PRODUCTO',
      page: 1,
      pageSize: PAGE_SIZE,
    });
  });

  it('tipo "SERVICIO" → agrega tipo', () => {
    expect(buildItemsParams('SERVICIO', 'activos', '', 2).tipo).toBe('SERVICIO');
  });

  it('estado "inactivos" → activo: false', () => {
    expect(buildItemsParams('todos', 'inactivos', '', 1).activo).toBe(false);
  });

  it('estado "todos" → activo: "all"', () => {
    expect(buildItemsParams('todos', 'todos', '', 1).activo).toBe('all');
  });

  it('q con contenido → agrega q', () => {
    expect(buildItemsParams('todos', 'activos', 'pollo', 3)).toEqual({
      q: 'pollo',
      page: 3,
      pageSize: PAGE_SIZE,
    });
  });

  it('estado "activos" NO manda activo (el default del backend ya filtra)', () => {
    expect('activo' in buildItemsParams('todos', 'activos', '', 1)).toBe(false);
  });
});
