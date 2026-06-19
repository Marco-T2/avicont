import { describe, expect, it } from 'vitest';

import type { Cuenta } from '@/types/api';

import { derivarCuentaFiltroLabel } from './derivar-cuenta-filtro';

function cuenta(id: string, codigoInterno: string, nombre: string): Cuenta {
  return { id, codigoInterno, nombre } as unknown as Cuenta;
}

const catalogo: Cuenta[] = [
  cuenta('c1', '1.1.1.001', 'Caja'),
  cuenta('c2', '4.1.1.001', 'Ventas'),
];

describe('derivarCuentaFiltroLabel', () => {
  it('devuelve "código — nombre" cuando la cuenta existe en el catálogo', () => {
    expect(derivarCuentaFiltroLabel('c1', catalogo)).toBe('1.1.1.001 — Caja');
  });

  it('devuelve undefined cuando no hay filtro (cuentaId undefined)', () => {
    expect(derivarCuentaFiltroLabel(undefined, catalogo)).toBeUndefined();
  });

  it('devuelve undefined cuando el cuentaId no está en el catálogo', () => {
    expect(derivarCuentaFiltroLabel('inexistente', catalogo)).toBeUndefined();
  });

  it('devuelve undefined cuando el catálogo está vacío', () => {
    expect(derivarCuentaFiltroLabel('c1', [])).toBeUndefined();
  });
});
