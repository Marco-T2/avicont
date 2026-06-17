import { describe, expect, it } from 'vitest';

import type { EmpresaPerfil } from '@/features/tenants/api/get-empresa';
import type { Celda } from '@/lib/export-excel';

import { construirReportePdf } from './construir-reporte-pdf';

const perfil: EmpresaPerfil = {
  razonSocial: 'Avicont S.R.L.',
  nit: '1234567',
  direccion: 'Av. Siempre Viva 123',
  representanteLegal: null,
  telefono: null,
  email: null,
};

const filas: Celda[][] = [
  [
    { type: 'texto', value: 'Fecha', fontWeight: 'bold' },
    { type: 'texto', value: 'Debe (BOB)', fontWeight: 'bold' },
  ],
  [
    { type: 'texto', value: '10/06/2026' },
    { type: 'numero', value: '5000.00' },
  ],
];

describe('construirReportePdf (smoke)', () => {
  it('renderiza el árbol react-pdf y produce un Blob PDF no vacío', async () => {
    const blob = await construirReportePdf({
      titulo: 'Libro Diario',
      subtitulo: '01/06/2026 — 30/06/2026',
      perfil,
      columnas: [{ flex: 1 }, { flex: 1 }],
      filas,
      orientacion: 'landscape',
    });

    expect(blob).toBeInstanceOf(Blob);
    expect(blob.size).toBeGreaterThan(0);
  });
});
