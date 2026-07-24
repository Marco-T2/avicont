import { describe, expect, it } from 'vitest';

import type { PerfilExtractoDescriptor } from '@/types/api';

import { etiquetaPerfilExtracto, indiceEtiquetasPerfil } from './etiqueta-perfil-extracto';

function descriptor(
  perfil: PerfilExtractoDescriptor['perfil'],
  banco: string,
): PerfilExtractoDescriptor {
  return {
    perfil,
    banco,
    formato: 'Excel (.xlsx)',
    extensiones: ['.xlsx'],
    mimeTypes: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
    estrategiaChecksum: 'DERIVADO',
    soportaContraparte: false,
    soportaHora: true,
    exponeNumeroCuenta: true,
    instruccionesDescarga: 'Descargá el extracto en Excel.',
  };
}

describe('etiquetaPerfilExtracto', () => {
  it('compone "banco — formato"', () => {
    expect(etiquetaPerfilExtracto(descriptor('BANCOSOL_XLSX', 'Banco Sol'))).toBe(
      'Banco Sol — Excel (.xlsx)',
    );
  });
});

describe('indiceEtiquetasPerfil', () => {
  it('indexa por perfil', () => {
    const indice = indiceEtiquetasPerfil([
      descriptor('BANCOSOL_XLSX', 'Banco Sol'),
      descriptor('BCP_XLSX', 'Banco de Crédito BCP'),
    ]);

    expect(indice.BANCOSOL_XLSX).toBe('Banco Sol — Excel (.xlsx)');
    expect(indice.BCP_XLSX).toBe('Banco de Crédito BCP — Excel (.xlsx)');
  });

  // Fail-soft deliberado: el catálogo llega por red. Si todavía no cargó, el
  // caller cae al valor crudo del enum — nunca a una celda vacía.
  it('devuelve un índice vacío si el catálogo todavía no cargó', () => {
    expect(indiceEtiquetasPerfil(undefined)).toEqual({});
    expect(indiceEtiquetasPerfil([])).toEqual({});
  });
});
