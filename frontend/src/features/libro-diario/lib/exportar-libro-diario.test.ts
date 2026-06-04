import { describe, expect, it } from 'vitest';

import type { EmpresaPerfil } from '@/features/tenants/api/get-empresa';
import type { LibroDiarioResponse } from '@/types/api';

import { mapearLibroDiarioAFilas } from './exportar-libro-diario';

const perfilCompleto: EmpresaPerfil = {
  razonSocial: 'Avicont S.R.L.',
  nit: '1234567',
  direccion: 'Av. Siempre Viva 123',
  representanteLegal: 'Juan Pérez',
  telefono: '+591 70000000',
  email: 'admin@avicont.bo',
};

const perfilTodoNull: EmpresaPerfil = {
  razonSocial: null,
  nit: null,
  direccion: null,
  representanteLegal: null,
  telefono: null,
  email: null,
};

function crearResponseLibroDiario(overrides?: Partial<LibroDiarioResponse>): LibroDiarioResponse {
  return {
    rango: { fechaDesde: '2026-06-01', fechaHasta: '2026-06-30' },
    asientos: [
      {
        id: 'a1',
        fechaContable: '2026-06-10',
        numero: 'I2606-000001',
        tipo: 'INGRESO',
        estado: 'CONTABILIZADO',
        glosa: 'Venta de aves',
        anulado: false,
        lineas: [
          {
            codigoCuenta: '1101',
            nombreCuenta: 'Caja',
            glosa: 'Ingreso caja',
            debeBob: '5000.00',
            haberBob: '0.00',
          },
          {
            codigoCuenta: '4101',
            nombreCuenta: 'Ventas',
            glosa: null,
            debeBob: '0.00',
            haberBob: '5000.00',
          },
        ],
      },
      {
        id: 'a2',
        fechaContable: '2026-06-15',
        numero: 'I2606-000002',
        tipo: 'EGRESO',
        estado: 'CONTABILIZADO',
        glosa: 'Compra insumos',
        anulado: false,
        lineas: [
          {
            codigoCuenta: '5101',
            nombreCuenta: 'Costo de ventas',
            glosa: 'Compra',
            debeBob: '2000.00',
            haberBob: '0.00',
          },
          {
            codigoCuenta: '2101',
            nombreCuenta: 'Proveedores',
            glosa: 'Pago proveedor',
            debeBob: '0.00',
            haberBob: '1500.00',
          },
          {
            codigoCuenta: '1101',
            nombreCuenta: 'Caja',
            glosa: 'Pago',
            debeBob: '0.00',
            haberBob: '500.00',
          },
        ],
      },
    ],
    totalDebeBob: '7000.00',
    totalHaberBob: '7000.00',
    ...overrides,
  };
}

describe('mapearLibroDiarioAFilas', () => {
  it('aplana asiento→líneas: 2 asientos (2+3 líneas) → 5 filas de detalle', () => {
    const response = crearResponseLibroDiario();
    const filas = mapearLibroDiarioAFilas(response, perfilCompleto);

    // Cabecera fiscal (6 campos) + 1 fila de encabezados + 5 filas de detalle + 1 fila de totales
    const filasHeader = 6; // perfil completo
    const filasEncabezados = 1;
    const filasDetalle = 5;
    const filasTotales = 1;
    expect(filas).toHaveLength(filasHeader + filasEncabezados + filasDetalle + filasTotales);
  });

  it('cada fila de detalle contiene: fecha dd/mm/yyyy, codigoCuenta, nombreCuenta, glosa, debeBob (CeldaNumero), haberBob (CeldaNumero)', () => {
    const response = crearResponseLibroDiario();
    const filas = mapearLibroDiarioAFilas(response, perfilTodoNull);

    // Sin cabecera fiscal (todo null) → 1 encabezados + 5 detalle + 1 totales = 7
    // Primera fila es los encabezados de columna, la segunda es la primera línea de detalle
    const primeraFilaDetalle = filas[1]; // índice 1 = primera fila de detalle (tras encabezados col)
    expect(primeraFilaDetalle).toBeDefined();

    if (primeraFilaDetalle) {
      // fecha: dd/mm/yyyy como texto
      const celdaFecha = primeraFilaDetalle[0];
      expect(celdaFecha).toEqual({ type: 'texto', value: '10/06/2026' });

      // codigo cuenta
      expect(primeraFilaDetalle[1]).toEqual({ type: 'texto', value: '1101' });

      // nombre cuenta
      expect(primeraFilaDetalle[2]).toEqual({ type: 'texto', value: 'Caja' });

      // glosa
      expect(primeraFilaDetalle[3]).toEqual({ type: 'texto', value: 'Ingreso caja' });

      // debeBob como CeldaNumero
      const celdaDebe = primeraFilaDetalle[4];
      expect(celdaDebe).toEqual({ type: 'numero', value: '5000.00' });

      // haberBob como CeldaNumero
      const celdaHaber = primeraFilaDetalle[5];
      expect(celdaHaber).toEqual({ type: 'numero', value: '0.00' });
    }
  });

  it('la fila de totales usa totalDebeBob y totalHaberBob del backend (sin recálculo)', () => {
    const response = crearResponseLibroDiario({
      totalDebeBob: '5000.00',
      totalHaberBob: '5000.00',
    });
    const filas = mapearLibroDiarioAFilas(response, perfilTodoNull);

    // La última fila es la de totales
    const filasTotales = filas[filas.length - 1];
    expect(filasTotales).toBeDefined();

    if (filasTotales) {
      // Buscamos las celdas de debe y haber del total
      const celdaDebe = filasTotales.find((c) => c.type === 'numero' && c.value === '5000.00');
      expect(celdaDebe).toBeDefined();
    }
  });

  it('marca las filas de un asiento anulado con texto "Anulado"', () => {
    const response = crearResponseLibroDiario({
      asientos: [
        {
          id: 'a1',
          fechaContable: '2026-06-10',
          numero: 'I2606-000001',
          tipo: 'INGRESO',
          estado: 'CONTABILIZADO',
          glosa: 'Asiento anulado',
          anulado: true,
          lineas: [
            {
              codigoCuenta: '1101',
              nombreCuenta: 'Caja',
              glosa: 'Línea del asiento anulado',
              debeBob: '1000.00',
              haberBob: '0.00',
            },
          ],
        },
      ],
    });
    const filas = mapearLibroDiarioAFilas(response, perfilTodoNull);

    // 1 encabezado columnas + 1 detalle + 1 totales = 3
    const filaDetalle = filas[1];
    expect(filaDetalle).toBeDefined();

    if (filaDetalle) {
      // La última celda (estado) debe indicar "Anulado"
      const celdaEstado = filaDetalle[filaDetalle.length - 1];
      expect(celdaEstado).toEqual({ type: 'texto', value: 'Anulado' });
    }
  });

  it('la celda de glosa queda vacía (no "null") cuando glosa es null', () => {
    const response = crearResponseLibroDiario({
      asientos: [
        {
          id: 'a1',
          fechaContable: '2026-06-10',
          numero: null,
          tipo: 'INGRESO',
          estado: 'CONTABILIZADO',
          glosa: 'Test',
          anulado: false,
          lineas: [
            {
              codigoCuenta: '1101',
              nombreCuenta: 'Caja',
              glosa: null, // glosa null — debe quedar '' en la celda
              debeBob: '1000.00',
              haberBob: '0.00',
            },
          ],
        },
      ],
    });
    const filas = mapearLibroDiarioAFilas(response, perfilTodoNull);

    // 1 encabezado + 1 detalle + 1 totales = 3
    const filaDetalle = filas[1];
    expect(filaDetalle).toBeDefined();

    if (filaDetalle) {
      const celdaGlosa = filaDetalle[3]; // índice 3 = glosa
      expect(celdaGlosa).toEqual({ type: 'texto', value: '' });
      // Asegura que nunca se escribe "null"
      expect(celdaGlosa?.value).not.toBe('null');
    }
  });

  it('incluye la cabecera fiscal al inicio cuando todos los campos están presentes', () => {
    const response = crearResponseLibroDiario({
      asientos: [
        {
          id: 'a1',
          fechaContable: '2026-06-10',
          numero: null,
          tipo: 'INGRESO',
          estado: 'CONTABILIZADO',
          glosa: 'Test',
          anulado: false,
          lineas: [
            {
              codigoCuenta: '1101',
              nombreCuenta: 'Caja',
              glosa: 'Test',
              debeBob: '1000.00',
              haberBob: '0.00',
            },
          ],
        },
      ],
    });
    const filas = mapearLibroDiarioAFilas(response, perfilCompleto);

    // Perfil completo = 6 filas de cabecera fiscal al inicio
    // La primera fila debe contener la razón social
    const primeraFila = filas[0];
    expect(primeraFila?.[0]).toEqual({ type: 'texto', value: 'Avicont S.R.L.' });
  });

  it('no rompe cuando el perfil fiscal tiene todos los campos null', () => {
    const response = crearResponseLibroDiario();
    expect(() => mapearLibroDiarioAFilas(response, perfilTodoNull)).not.toThrow();

    const filas = mapearLibroDiarioAFilas(response, perfilTodoNull);
    // Sin cabecera fiscal → 1 encabezados + 5 detalle + 1 totales = 7
    expect(filas.length).toBeGreaterThan(0);
    // Ninguna celda debe contener "null"
    const todasLasValues = filas
      .flatMap((fila) => fila)
      .map((celda) => celda.value);
    expect(todasLasValues.some((v) => v === 'null')).toBe(false);
  });
});
