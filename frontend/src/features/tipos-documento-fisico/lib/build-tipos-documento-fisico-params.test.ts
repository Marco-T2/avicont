import { describe, expect, it } from 'vitest';

import {
  buildTiposDocumentoFisicoParams,
  PAGE_SIZE,
} from './build-tipos-documento-fisico-params';

describe('buildTiposDocumentoFisicoParams', () => {
  describe('filtro por estado', () => {
    it('estado "activos" → params sin clave activo (backend default = solo activos)', () => {
      const params = buildTiposDocumentoFisicoParams('activos', '', 1);
      expect(params).not.toHaveProperty('activo');
    });

    it('estado "inactivos" → params con activo: false', () => {
      const params = buildTiposDocumentoFisicoParams('inactivos', '', 1);
      expect(params.activo).toBe(false);
    });

    it('estado "todos" → params con activo: "all"', () => {
      const params = buildTiposDocumentoFisicoParams('todos', '', 1);
      expect(params.activo).toBe('all');
    });
  });

  describe('filtro de búsqueda q', () => {
    it('q vacío → params sin clave q', () => {
      const params = buildTiposDocumentoFisicoParams('activos', '', 1);
      expect(params).not.toHaveProperty('q');
    });

    it('q "fact" → params con q: "fact"', () => {
      const params = buildTiposDocumentoFisicoParams('activos', 'fact', 1);
      expect(params.q).toBe('fact');
    });
  });

  describe('paginación', () => {
    it('page=2 → params con page 2 y pageSize correcto', () => {
      const params = buildTiposDocumentoFisicoParams('activos', '', 2);
      expect(params.page).toBe(2);
      expect(params.pageSize).toBe(PAGE_SIZE);
    });
  });

  describe('combinaciones', () => {
    it('todos + q + page 3', () => {
      const params = buildTiposDocumentoFisicoParams('todos', 'fact', 3);
      expect(params.activo).toBe('all');
      expect(params.q).toBe('fact');
      expect(params.page).toBe(3);
    });

    it('inactivos sin q', () => {
      const params = buildTiposDocumentoFisicoParams('inactivos', '', 1);
      expect(params.activo).toBe(false);
      expect(params).not.toHaveProperty('q');
    });
  });
});
