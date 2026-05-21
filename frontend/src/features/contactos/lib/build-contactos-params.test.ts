import { describe, expect, it } from 'vitest';

import { buildContactosParams, PAGE_SIZE } from './build-contactos-params';

describe('buildContactosParams', () => {
  describe('filtro por rol', () => {
    it('rol=todos no manda esCliente ni esProveedor', () => {
      const params = buildContactosParams('todos', false, '', 1);
      expect(params).not.toHaveProperty('esCliente');
      expect(params).not.toHaveProperty('esProveedor');
    });

    it('rol=clientes manda esCliente=true y no manda esProveedor', () => {
      const params = buildContactosParams('clientes', false, '', 1);
      expect(params.esCliente).toBe(true);
      expect(params).not.toHaveProperty('esProveedor');
    });

    it('rol=proveedores manda esProveedor=true y no manda esCliente', () => {
      const params = buildContactosParams('proveedores', false, '', 1);
      expect(params.esProveedor).toBe(true);
      expect(params).not.toHaveProperty('esCliente');
    });
  });

  describe('filtro incluirInactivos → activo', () => {
    it('incluirInactivos=true manda activo="all"', () => {
      const params = buildContactosParams('todos', true, '', 1);
      expect(params.activo).toBe('all');
    });

    it('incluirInactivos=false NO manda activo (backend default = solo activos)', () => {
      const params = buildContactosParams('todos', false, '', 1);
      expect(params).not.toHaveProperty('activo');
    });
  });

  describe('filtro de búsqueda q', () => {
    it('q vacío no manda q', () => {
      const params = buildContactosParams('todos', false, '', 1);
      expect(params).not.toHaveProperty('q');
    });

    it('q no vacío se incluye en los params', () => {
      const params = buildContactosParams('todos', false, 'acme', 1);
      expect(params.q).toBe('acme');
    });
  });

  describe('paginación', () => {
    it('incluye page y pageSize correctos', () => {
      const params = buildContactosParams('todos', false, '', 3);
      expect(params.page).toBe(3);
      expect(params.pageSize).toBe(PAGE_SIZE);
    });
  });

  describe('combinaciones', () => {
    it('clientes + incluirInactivos + q', () => {
      const params = buildContactosParams('clientes', true, 'acme', 2);
      expect(params.esCliente).toBe(true);
      expect(params).not.toHaveProperty('esProveedor');
      expect(params.activo).toBe('all');
      expect(params.q).toBe('acme');
      expect(params.page).toBe(2);
    });

    it('proveedores sin inactivos sin q', () => {
      const params = buildContactosParams('proveedores', false, '', 1);
      expect(params.esProveedor).toBe(true);
      expect(params).not.toHaveProperty('esCliente');
      expect(params).not.toHaveProperty('activo');
      expect(params).not.toHaveProperty('q');
    });
  });
});
