import { describe, expect, it } from 'vitest';

import {
  buildDocumentosFisicosParams,
  PAGE_SIZE,
} from './build-documentos-fisicos-params';

describe('buildDocumentosFisicosParams', () => {
  it('sin filtros → solo page y pageSize (sin campos extra)', () => {
    const params = buildDocumentosFisicosParams({}, 1);
    expect(params).toEqual({ page: 1, pageSize: PAGE_SIZE });
    expect(params).not.toHaveProperty('numero');
    expect(params).not.toHaveProperty('estadoAsociacion');
    expect(params).not.toHaveProperty('tipoDocumentoFisicoId');
    expect(params).not.toHaveProperty('fechaDesde');
    expect(params).not.toHaveProperty('fechaHasta');
  });

  it('con estadoAsociacion y fechas → incluye esos campos', () => {
    const params = buildDocumentosFisicosParams(
      {
        estadoAsociacion: 'SUELTO',
        fechaDesde: '2026-01-01',
        fechaHasta: '2026-05-31',
      },
      2,
    );
    expect(params.estadoAsociacion).toBe('SUELTO');
    expect(params.fechaDesde).toBe('2026-01-01');
    expect(params.fechaHasta).toBe('2026-05-31');
    expect(params.page).toBe(2);
    expect(params.pageSize).toBe(PAGE_SIZE);
  });

  it('numero vacío → se omite del resultado', () => {
    const params = buildDocumentosFisicosParams({ numero: '' }, 1);
    expect(params).not.toHaveProperty('numero');
  });

  it('numero con valor → se incluye', () => {
    const params = buildDocumentosFisicosParams({ numero: 'F-001' }, 1);
    expect(params.numero).toBe('F-001');
  });

  it('tipoDocumentoFisicoId vacío → se omite', () => {
    const params = buildDocumentosFisicosParams({ tipoDocumentoFisicoId: '' }, 1);
    expect(params).not.toHaveProperty('tipoDocumentoFisicoId');
  });

  it('estadoAsociacion undefined → se omite', () => {
    const params = buildDocumentosFisicosParams({ estadoAsociacion: undefined }, 1);
    expect(params).not.toHaveProperty('estadoAsociacion');
  });
});
