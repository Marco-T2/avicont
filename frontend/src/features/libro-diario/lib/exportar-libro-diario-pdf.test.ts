import { describe, expect, it } from 'vitest';

import type { LibroDiarioResponse } from '@/types/api';

import { mapearLibroDiarioACeldasPdf } from './exportar-libro-diario-pdf';

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

describe('mapearLibroDiarioACeldasPdf', () => {
  it('NO incluye cabecera fiscal en la matriz (se renderiza como bloque aparte en el PDF)', () => {
    const filas = mapearLibroDiarioACeldasPdf(crearResponseLibroDiario());

    // 1 fila de encabezados de columna + 5 detalle + 1 totales = 7
    expect(filas).toHaveLength(7);
    // La primera fila son los encabezados de columna, NUNCA la razón social.
    expect(filas[0]?.[0]).toEqual({ type: 'texto', value: 'Fecha', fontWeight: 'bold' });
  });

  it('aplana asiento→líneas: la primera fila de detalle trae fecha dd/mm/yyyy, código, nombre, glosa y montos string', () => {
    const filas = mapearLibroDiarioACeldasPdf(crearResponseLibroDiario());
    const primeraFilaDetalle = filas[1];
    expect(primeraFilaDetalle).toBeDefined();

    if (primeraFilaDetalle) {
      // §4.6: fecha formateada sin Date/UTC
      expect(primeraFilaDetalle[0]).toEqual({ type: 'texto', value: '10/06/2026' });
      expect(primeraFilaDetalle[1]).toEqual({ type: 'texto', value: '1101' });
      expect(primeraFilaDetalle[2]).toEqual({ type: 'texto', value: 'Caja' });
      expect(primeraFilaDetalle[3]).toEqual({ type: 'texto', value: 'Ingreso caja' });
      // §4.5: monto como string crudo del backend; el formateo ocurre en el render
      expect(primeraFilaDetalle[4]).toEqual({ type: 'numero', value: '5000.00' });
      expect(primeraFilaDetalle[5]).toEqual({ type: 'numero', value: '0.00' });
    }
  });

  it('la fila de totales usa totalDebeBob/totalHaberBob del backend (sin recálculo) y va en negrita', () => {
    const filas = mapearLibroDiarioACeldasPdf(
      crearResponseLibroDiario({ totalDebeBob: '5000.00', totalHaberBob: '5000.00' }),
    );
    const filaTotales = filas[filas.length - 1];
    expect(filaTotales).toBeDefined();

    if (filaTotales) {
      const celdaDebe = filaTotales.find((c) => c.type === 'numero' && c.value === '5000.00');
      expect(celdaDebe).toBeDefined();
      filaTotales.forEach((celda) => expect(celda).toMatchObject({ fontWeight: 'bold' }));
    }
  });

  it('marca las líneas de un asiento anulado con "Anulado" en la columna estado', () => {
    const filas = mapearLibroDiarioACeldasPdf(
      crearResponseLibroDiario({
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
                glosa: 'Línea anulada',
                debeBob: '1000.00',
                haberBob: '0.00',
              },
            ],
          },
        ],
      }),
    );
    const filaDetalle = filas[1];
    expect(filaDetalle?.[filaDetalle.length - 1]).toEqual({ type: 'texto', value: 'Anulado' });
  });

  it('deja la glosa vacía (no "null") cuando glosa es null', () => {
    const filas = mapearLibroDiarioACeldasPdf(
      crearResponseLibroDiario({
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
                glosa: null,
                debeBob: '1000.00',
                haberBob: '0.00',
              },
            ],
          },
        ],
      }),
    );
    const filaDetalle = filas[1];
    expect(filaDetalle?.[3]).toEqual({ type: 'texto', value: '' });
    expect(filaDetalle?.[3]?.value).not.toBe('null');
  });

  it('las filas de detalle no llevan fontWeight en ninguna celda', () => {
    const filas = mapearLibroDiarioACeldasPdf(crearResponseLibroDiario());
    const primeraFilaDetalle = filas[1];
    primeraFilaDetalle?.forEach((celda) => expect('fontWeight' in celda).toBe(false));
  });

  it('nunca escribe la cadena literal "null" en ninguna celda', () => {
    const filas = mapearLibroDiarioACeldasPdf(crearResponseLibroDiario());
    const values = filas.flat().map((c) => c.value);
    expect(values.some((v) => v === 'null')).toBe(false);
  });
});
