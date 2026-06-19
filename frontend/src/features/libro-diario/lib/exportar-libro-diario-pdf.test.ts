import { describe, expect, it } from 'vitest';

import type { LibroDiarioResponse } from '@/types/api';

import {
  etiquetaTipoComprobante,
  mapearLibroDiarioADocumentoPdf,
} from './exportar-libro-diario-pdf';

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
        totalDebeBob: '5000.00',
        totalHaberBob: '5000.00',
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
        numero: 'E2606-000002',
        tipo: 'EGRESO',
        estado: 'CONTABILIZADO',
        glosa: 'Compra insumos',
        anulado: false,
        totalDebeBob: '2000.00',
        totalHaberBob: '2000.00',
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

describe('etiquetaTipoComprobante', () => {
  it('traduce cada tipo del backend a su etiqueta user-facing', () => {
    expect(etiquetaTipoComprobante('INGRESO')).toBe('Ingreso');
    expect(etiquetaTipoComprobante('EGRESO')).toBe('Egreso');
    expect(etiquetaTipoComprobante('DIARIO')).toBe('Diario');
    expect(etiquetaTipoComprobante('TRASPASO')).toBe('Traspaso');
    expect(etiquetaTipoComprobante('AJUSTE')).toBe('Ajuste');
    expect(etiquetaTipoComprobante('APERTURA')).toBe('Apertura');
    expect(etiquetaTipoComprobante('CIERRE')).toBe('Cierre');
  });

  it('devuelve el tipo crudo si es desconocido (nunca pierde el dato)', () => {
    expect(etiquetaTipoComprobante('OTRO')).toBe('OTRO');
  });
});

describe('mapearLibroDiarioADocumentoPdf', () => {
  it('agrupa por comprobante: un grupo por asiento, en el mismo orden', () => {
    const modelo = mapearLibroDiarioADocumentoPdf(crearResponseLibroDiario());

    expect(modelo.asientos).toHaveLength(2);
    expect(modelo.asientos[0]?.tipoLabel).toBe('Ingreso');
    expect(modelo.asientos[0]?.numero).toBe('I2606-000001');
    expect(modelo.asientos[1]?.tipoLabel).toBe('Egreso');
  });

  it('formatea la fecha del comprobante sin Date/UTC (§4.6) y la pone una sola vez por grupo', () => {
    const modelo = mapearLibroDiarioADocumentoPdf(crearResponseLibroDiario());
    expect(modelo.asientos[0]?.fecha).toBe('10/06/2026');
  });

  it('una sola glosa por comprobante (la del asiento, no la de cada línea)', () => {
    const modelo = mapearLibroDiarioADocumentoPdf(crearResponseLibroDiario());
    expect(modelo.asientos[0]?.glosa).toBe('Venta de aves');
    expect(modelo.asientos[1]?.glosa).toBe('Compra insumos');
  });

  it('las filas del grupo NO traen ni fecha ni estado ni glosa de línea (solo código/nombre/debe/haber)', () => {
    const modelo = mapearLibroDiarioADocumentoPdf(crearResponseLibroDiario());
    const fila = modelo.asientos[0]?.filas[0];
    expect(fila).toEqual({
      codigo: '1101',
      nombre: 'Caja',
      debe: '5000.00',
      haber: '0.00',
    });
  });

  it('usa los subtotales por asiento del backend, sin recalcular en el cliente (§4.5)', () => {
    const modelo = mapearLibroDiarioADocumentoPdf(crearResponseLibroDiario());
    expect(modelo.asientos[0]?.totalDebe).toBe('5000.00');
    expect(modelo.asientos[0]?.totalHaber).toBe('5000.00');
    expect(modelo.asientos[1]?.totalDebe).toBe('2000.00');
  });

  it('usa el total general del backend, sin recalcular (§4.5)', () => {
    const modelo = mapearLibroDiarioADocumentoPdf(
      crearResponseLibroDiario({ totalDebeBob: '9999.00', totalHaberBob: '9999.00' }),
    );
    expect(modelo.totalDebe).toBe('9999.00');
    expect(modelo.totalHaber).toBe('9999.00');
  });

  it('propaga el flag anulado al grupo', () => {
    const base = crearResponseLibroDiario();
    const asientoAnulado = { ...base.asientos[0]!, anulado: true };
    const modelo = mapearLibroDiarioADocumentoPdf({ ...base, asientos: [asientoAnulado] });
    expect(modelo.asientos[0]?.anulado).toBe(true);
  });

  it('cuando numero es null usa un placeholder (no la cadena "null")', () => {
    const base = crearResponseLibroDiario();
    const asientoSinNumero = { ...base.asientos[0]!, numero: null };
    const modelo = mapearLibroDiarioADocumentoPdf({ ...base, asientos: [asientoSinNumero] });
    expect(modelo.asientos[0]?.numero).toBe('—');
    expect(modelo.asientos[0]?.numero).not.toBe('null');
  });
});
