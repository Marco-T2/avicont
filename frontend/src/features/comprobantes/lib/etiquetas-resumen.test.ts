import { describe, expect, it } from 'vitest';

import type { ContactoResumen, DocumentoRespaldoResumen } from '@/types/api';

import {
  etiquetaContacto,
  etiquetaDocumentoNumero,
  etiquetaDocumentoTipo,
} from './etiquetas-resumen';

const avicola: ContactoResumen = { id: 'c-1', nombre: 'Avícola Sur S.R.L.' };
const molinos: ContactoResumen = { id: 'c-2', nombre: 'Molinos SA' };
const factura: DocumentoRespaldoResumen = {
  id: 'd-1',
  tipoNombre: 'Factura',
  numero: '0042',
};
const recibo: DocumentoRespaldoResumen = {
  id: 'd-2',
  tipoNombre: 'Recibo',
  numero: '0108',
};

describe('etiquetaContacto', () => {
  it('sin contactos → "Sin contacto asociado"', () => {
    expect(etiquetaContacto([])).toBe('Sin contacto asociado');
  });

  it('un contacto → su nombre', () => {
    expect(etiquetaContacto([avicola])).toBe('Avícola Sur S.R.L.');
  });

  it('más de un contacto → "Varios"', () => {
    expect(etiquetaContacto([avicola, molinos])).toBe('Varios');
  });
});

describe('etiquetaDocumentoTipo', () => {
  it('sin documentos → "—"', () => {
    expect(etiquetaDocumentoTipo([])).toBe('—');
  });

  it('un documento → su tipo', () => {
    expect(etiquetaDocumentoTipo([factura])).toBe('Factura');
  });

  it('más de un documento → "Varios"', () => {
    expect(etiquetaDocumentoTipo([factura, recibo])).toBe('Varios');
  });
});

describe('etiquetaDocumentoNumero', () => {
  it('sin documentos → "—"', () => {
    expect(etiquetaDocumentoNumero([])).toBe('—');
  });

  it('un documento → su número', () => {
    expect(etiquetaDocumentoNumero([factura])).toBe('0042');
  });

  it('más de un documento → "Varios"', () => {
    expect(etiquetaDocumentoNumero([factura, recibo])).toBe('Varios');
  });
});
