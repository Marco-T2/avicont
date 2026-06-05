import { describe, expect, it } from 'vitest';

import type { EmpresaPerfil } from '@/features/tenants/api/get-empresa';
import type { LibroMayorResponse } from '@/types/api';

import { mapearLibroMayorAFilas } from './exportar-libro-mayor';

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

function crearResponseLibroMayor(
  overrides?: Partial<LibroMayorResponse>,
): LibroMayorResponse {
  return {
    rango: { fechaDesde: '2026-06-01', fechaHasta: '2026-06-30' },
    totalDebeBob: '7000.00',
    totalHaberBob: '7000.00',
    cuentas: [
      {
        cuentaId: 'c1',
        codigoInterno: '1101',
        nombreCuenta: 'Caja',
        naturaleza: 'DEUDORA',
        saldoInicialBob: '0.00',
        saldoFinalBob: '3000.00',
        totalDebeBob: '5000.00',
        totalHaberBob: '2000.00',
        movimientos: [
          {
            comprobanteId: 'cp1',
            numeroComprobante: 'I2606-000001',
            fechaContable: '2026-06-10',
            glosa: 'Venta de aves',
            glosaLinea: 'Ingreso caja',
            estado: 'CONTABILIZADO',
            anulado: false,
            orden: 1,
            debeBob: '5000.00',
            haberBob: '0.00',
            saldoCorrienteBob: '5000.00',
          },
          {
            comprobanteId: 'cp2',
            numeroComprobante: 'I2606-000002',
            fechaContable: '2026-06-15',
            glosa: 'Compra insumos',
            glosaLinea: null,
            estado: 'CONTABILIZADO',
            anulado: false,
            orden: 2,
            debeBob: '0.00',
            haberBob: '2000.00',
            saldoCorrienteBob: '3000.00',
          },
        ],
      },
      {
        cuentaId: 'c2',
        codigoInterno: '4101',
        nombreCuenta: 'Ventas',
        naturaleza: 'ACREEDORA',
        saldoInicialBob: '0.00',
        saldoFinalBob: '2000.00',
        totalDebeBob: '0.00',
        totalHaberBob: '2000.00',
        movimientos: [
          {
            comprobanteId: 'cp1',
            numeroComprobante: 'I2606-000001',
            fechaContable: '2026-06-10',
            glosa: 'Venta de aves',
            glosaLinea: 'Ventas mes',
            estado: 'CONTABILIZADO',
            anulado: false,
            orden: 2,
            debeBob: '0.00',
            haberBob: '2000.00',
            saldoCorrienteBob: '2000.00',
          },
        ],
      },
    ],
    ...overrides,
  };
}

describe('mapearLibroMayorAFilas', () => {
  it('aplana cuenta→movimientos: 2 cuentas (2+1 movs) → por cuenta una fila de cabecera + filas de movimiento', () => {
    const response = crearResponseLibroMayor();
    const filas = mapearLibroMayorAFilas(response, perfilTodoNull);

    // Sin cabecera fiscal (todo null):
    // 1 fila encabezados columna
    // Cuenta 1: 1 fila cabecera cuenta + 2 movimientos
    // Cuenta 2: 1 fila cabecera cuenta + 1 movimiento
    // 1 fila total general
    // = 1 + 3 + 2 + 1 = 7
    expect(filas.length).toBe(7);
  });

  it('cada movimiento lleva fecha dd/mm/yyyy, comprobante, glosa, debe, haber y saldo corriente (CeldaNumero)', () => {
    const response = crearResponseLibroMayor();
    const filas = mapearLibroMayorAFilas(response, perfilTodoNull);

    // Fila 0 = encabezados de columna
    // Fila 1 = cabecera cuenta Caja
    // Fila 2 = primer movimiento de Caja
    const filaMovimiento = filas[2];
    expect(filaMovimiento).toBeDefined();

    if (filaMovimiento) {
      // fecha dd/mm/yyyy
      expect(filaMovimiento[0]).toEqual({ type: 'texto', value: '10/06/2026' });
      // numero comprobante
      expect(filaMovimiento[1]).toEqual({ type: 'texto', value: 'I2606-000001' });
      // glosa: glosaLinea si existe
      expect(filaMovimiento[2]).toEqual({ type: 'texto', value: 'Ingreso caja' });
      // debe como CeldaNumero
      expect(filaMovimiento[3]).toEqual({ type: 'numero', value: '5000.00' });
      // haber como CeldaNumero
      expect(filaMovimiento[4]).toEqual({ type: 'numero', value: '0.00' });
      // saldo corriente como CeldaNumero (§4.5 del backend, sin recalcular)
      expect(filaMovimiento[5]).toEqual({ type: 'numero', value: '5000.00' });
    }
  });

  it('el saldo corriente usa saldoCorrienteBob del backend, sin acumular debe/haber en cliente', () => {
    // saldoCorrienteBob = '9999.99' que NO es la suma acumulada de debe-haber
    const response = crearResponseLibroMayor({
      cuentas: [
        {
          cuentaId: 'c1',
          codigoInterno: '1101',
          nombreCuenta: 'Caja',
          naturaleza: 'DEUDORA',
          saldoInicialBob: '0.00',
          saldoFinalBob: '9999.99',
          totalDebeBob: '5000.00',
          totalHaberBob: '0.00',
          movimientos: [
            {
              comprobanteId: 'cp1',
              numeroComprobante: null,
              fechaContable: '2026-06-10',
              glosa: 'Test',
              glosaLinea: null,
              estado: 'CONTABILIZADO',
              anulado: false,
              orden: 1,
              debeBob: '5000.00',
              haberBob: '0.00',
              saldoCorrienteBob: '9999.99', // valor del backend, no la suma
            },
          ],
        },
      ],
    });

    const filas = mapearLibroMayorAFilas(response, perfilTodoNull);
    // Fila 0 = encabezados, Fila 1 = cabecera cuenta, Fila 2 = movimiento
    const filaMovimiento = filas[2];
    expect(filaMovimiento).toBeDefined();
    // La celda de saldo corriente debe usar exactamente el valor del backend
    const celdaSaldo = filaMovimiento![5];
    expect(celdaSaldo).toEqual({ type: 'numero', value: '9999.99' });
  });

  it('la fila de total general usa totalDebeBob/totalHaberBob del backend (sin recálculo)', () => {
    const response = crearResponseLibroMayor({
      totalDebeBob: '77777.77',
      totalHaberBob: '77777.77',
    });
    const filas = mapearLibroMayorAFilas(response, perfilTodoNull);

    const filaTotal = filas[filas.length - 1];
    expect(filaTotal).toBeDefined();

    const celdaDebe = filaTotal!.find(
      (c) => c.type === 'numero' && c.value === '77777.77',
    );
    expect(celdaDebe).toBeDefined();
  });

  it('marca el movimiento anulado con texto "Anulado"', () => {
    const response = crearResponseLibroMayor({
      cuentas: [
        {
          cuentaId: 'c1',
          codigoInterno: '1101',
          nombreCuenta: 'Caja',
          naturaleza: 'DEUDORA',
          saldoInicialBob: '0.00',
          saldoFinalBob: '0.00',
          totalDebeBob: '0.00',
          totalHaberBob: '0.00',
          movimientos: [
            {
              comprobanteId: 'cp1',
              numeroComprobante: null,
              fechaContable: '2026-06-10',
              glosa: 'Asiento anulado',
              glosaLinea: null,
              estado: 'CONTABILIZADO',
              anulado: true,
              orden: 1,
              debeBob: '1000.00',
              haberBob: '0.00',
              saldoCorrienteBob: '1000.00',
            },
          ],
        },
      ],
    });

    const filas = mapearLibroMayorAFilas(response, perfilTodoNull);
    // Fila 0 = encabezados, Fila 1 = cabecera cuenta, Fila 2 = movimiento
    const filaMovimiento = filas[2];
    expect(filaMovimiento).toBeDefined();

    const celdaEstado = filaMovimiento![filaMovimiento!.length - 1];
    expect(celdaEstado).toEqual({ type: 'texto', value: 'Anulado' });
  });

  it('no corre el día: fechaContable 2026-01-31 → "31/01/2026"', () => {
    const response = crearResponseLibroMayor({
      cuentas: [
        {
          cuentaId: 'c1',
          codigoInterno: '1101',
          nombreCuenta: 'Caja',
          naturaleza: 'DEUDORA',
          saldoInicialBob: '0.00',
          saldoFinalBob: '0.00',
          totalDebeBob: '0.00',
          totalHaberBob: '0.00',
          movimientos: [
            {
              comprobanteId: 'cp1',
              numeroComprobante: null,
              fechaContable: '2026-01-31',
              glosa: 'Test',
              glosaLinea: null,
              estado: 'CONTABILIZADO',
              anulado: false,
              orden: 1,
              debeBob: '100.00',
              haberBob: '0.00',
              saldoCorrienteBob: '100.00',
            },
          ],
        },
      ],
    });

    const filas = mapearLibroMayorAFilas(response, perfilTodoNull);
    const filaMovimiento = filas[2];
    expect(filaMovimiento).toBeDefined();
    expect(filaMovimiento![0]).toEqual({ type: 'texto', value: '31/01/2026' });
  });

  it('la celda de glosa queda vacía (no "null") cuando glosaLinea es null', () => {
    const response = crearResponseLibroMayor({
      cuentas: [
        {
          cuentaId: 'c1',
          codigoInterno: '1101',
          nombreCuenta: 'Caja',
          naturaleza: 'DEUDORA',
          saldoInicialBob: '0.00',
          saldoFinalBob: '0.00',
          totalDebeBob: '0.00',
          totalHaberBob: '0.00',
          movimientos: [
            {
              comprobanteId: 'cp1',
              numeroComprobante: null,
              fechaContable: '2026-06-10',
              glosa: 'Glosa principal',
              glosaLinea: null,
              estado: 'CONTABILIZADO',
              anulado: false,
              orden: 1,
              debeBob: '100.00',
              haberBob: '0.00',
              saldoCorrienteBob: '100.00',
            },
          ],
        },
      ],
    });

    const filas = mapearLibroMayorAFilas(response, perfilTodoNull);
    const filaMovimiento = filas[2];
    expect(filaMovimiento).toBeDefined();

    const celdaGlosa = filaMovimiento![2];
    expect(celdaGlosa).toBeDefined();
    expect(celdaGlosa!.value).not.toBe('null');
    // Con glosaLinea=null, cae a la glosa del comprobante
    expect(celdaGlosa!.value).toBe('Glosa principal');
  });

  it('incluye la cabecera fiscal al inicio cuando el perfil está completo', () => {
    const response = crearResponseLibroMayor({
      cuentas: [],
    });
    const filas = mapearLibroMayorAFilas(response, perfilCompleto);

    // Perfil completo → 6 filas de cabecera fiscal
    const primeraFila = filas[0];
    expect(primeraFila?.[0]).toEqual({ type: 'texto', value: 'Avicont S.R.L.' });
  });

  it('no rompe cuando el perfil fiscal tiene todos los campos null', () => {
    const response = crearResponseLibroMayor({ cuentas: [] });
    expect(() => mapearLibroMayorAFilas(response, perfilTodoNull)).not.toThrow();

    const filas = mapearLibroMayorAFilas(response, perfilTodoNull);
    const todasLasValues = filas.flatMap((fila) => fila).map((c) => c.value);
    expect(todasLasValues.some((v) => v === 'null')).toBe(false);
  });
});
