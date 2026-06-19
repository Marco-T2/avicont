import { describe, expect, it } from 'vitest';

import type { EmpresaPerfil } from '@/features/tenants/api/get-empresa';

import { construirLibroDiarioPdf } from './construir-libro-diario-pdf';
import type { LibroDiarioPdfModelo } from './exportar-libro-diario-pdf';

const perfil: EmpresaPerfil = {
  razonSocial: 'Empresa de Transportes Nacional',
  nit: '1234567',
  direccion: 'Av. Siempre Viva 123',
  representanteLegal: null,
  telefono: null,
  email: null,
};

const modelo: LibroDiarioPdfModelo = {
  asientos: [
    {
      tipoLabel: 'Egreso',
      numero: 'E2603-000003',
      fecha: '05/03/2016',
      anulado: false,
      filas: [
        { codigo: '5.7.24', nombre: 'Combustible y Lubricante', debe: '12547.00', haber: '0.00' },
        { codigo: '1.1.1.1.2', nombre: 'Caja Moneda Nacional', debe: '0.00', haber: '12547.00' },
      ],
      totalDebe: '12547.00',
      totalHaber: '12547.00',
      glosa: 'COMBUSTIBLE Y MANTENIMIENTO DE VEHÍCULOS MES MARZO',
    },
    {
      tipoLabel: 'Ajuste',
      numero: '—',
      fecha: '31/12/2016',
      anulado: true,
      filas: [{ codigo: '5.7.13', nombre: 'Depreciacion Vehiculos', debe: '32086.00', haber: '0.00' }],
      totalDebe: '32086.00',
      totalHaber: '32086.00',
      glosa: 'DEPRECIACIÓN DE VEHÍCULOS GESTIÓN 2016',
    },
  ],
  totalDebe: '44633.00',
  totalHaber: '44633.00',
};

describe('construirLibroDiarioPdf (smoke)', () => {
  it('renderiza el árbol react-pdf agrupado y produce un Blob PDF no vacío', async () => {
    const blob = await construirLibroDiarioPdf({
      titulo: 'Libro Diario',
      subtitulo: 'Del 01/06/2010 al 19/06/2026',
      perfil,
      modelo,
    });

    expect(blob).toBeInstanceOf(Blob);
    expect(blob.size).toBeGreaterThan(0);
  });
});
