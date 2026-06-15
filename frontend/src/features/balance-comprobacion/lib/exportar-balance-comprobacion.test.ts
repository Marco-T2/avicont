import { describe, expect, it } from 'vitest';

import type { EmpresaPerfil } from '@/features/tenants/api/get-empresa';
import type { BalanceComprobacionResponse } from '@/types/api';

import { mapearBalanceComprobacionAFilas } from './exportar-balance-comprobacion';

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

function crearResponse(
  overrides?: Partial<BalanceComprobacionResponse>,
): BalanceComprobacionResponse {
  return {
    fechaDesde: '2026-04-01',
    fechaHasta: '2026-04-30',
    lineas: [
      {
        cuentaId: 'c1',
        codigoInterno: '1101',
        nombre: 'Caja',
        naturaleza: 'DEUDORA',
        sumasDebito: '1000.00',
        sumasCredito: '300.00',
        saldoDeudor: '700.00',
        saldoAcreedor: '0.00',
      },
      {
        cuentaId: 'c2',
        codigoInterno: '4101',
        nombre: 'Ventas',
        naturaleza: 'ACREEDORA',
        sumasDebito: '0.00',
        sumasCredito: '700.00',
        saldoDeudor: '0.00',
        saldoAcreedor: '700.00',
      },
    ],
    totalSumasDebito: '1000.00',
    totalSumasCredito: '1000.00',
    totalSaldoDeudor: '700.00',
    totalSaldoAcreedor: '700.00',
    cuadra: true,
    diferenciaSumas: '0.00',
    diferenciaSaldos: '0.00',
    cuentasNaturalezaOpuesta: [],
    ...overrides,
  };
}

describe('mapearBalanceComprobacionAFilas', () => {
  it('genera una fila por cada cuenta de detalle con sus 4 columnas como número', () => {
    const filas = mapearBalanceComprobacionAFilas(crearResponse(), perfilTodoNull);

    const filaCaja = filas.find((f) => f[1]?.value === 'Caja');
    expect(filaCaja).toBeDefined();
    expect(filaCaja?.[0]).toMatchObject({ type: 'texto', value: '1101' });
    expect(filaCaja?.[2]).toMatchObject({ type: 'texto', value: 'DEUDORA' });
    expect(filaCaja?.[3]).toMatchObject({ type: 'numero', value: '1000.00' });
    expect(filaCaja?.[4]).toMatchObject({ type: 'numero', value: '300.00' });
    expect(filaCaja?.[5]).toMatchObject({ type: 'numero', value: '700.00' });
    expect(filaCaja?.[6]).toMatchObject({ type: 'numero', value: '0.00' });
  });

  it('incluye la fila TOTALES con los 4 totales del backend como número (sin recalcular)', () => {
    const filas = mapearBalanceComprobacionAFilas(
      crearResponse({
        totalSumasDebito: '88888.88',
        totalSumasCredito: '77777.77',
        totalSaldoDeudor: '66666.66',
        totalSaldoAcreedor: '55555.55',
      }),
      perfilTodoNull,
    );

    const filaTotales = filas.find((f) => f[0]?.value === 'TOTALES');
    expect(filaTotales?.[3]).toMatchObject({ type: 'numero', value: '88888.88' });
    expect(filaTotales?.[4]).toMatchObject({ type: 'numero', value: '77777.77' });
    expect(filaTotales?.[5]).toMatchObject({ type: 'numero', value: '66666.66' });
    expect(filaTotales?.[6]).toMatchObject({ type: 'numero', value: '55555.55' });
  });

  it('incluye una fila de cuadre con las diferencias del backend', () => {
    const filas = mapearBalanceComprobacionAFilas(
      crearResponse({ cuadra: false, diferenciaSumas: '12.34', diferenciaSaldos: '56.78' }),
      perfilTodoNull,
    );

    const filaCuadre = filas.find((f) => typeof f[0]?.value === 'string' && f[0].value.includes('No cuadra'));
    expect(filaCuadre).toBeDefined();
    const numeros = filaCuadre!.filter((c) => c.type === 'numero').map((c) => c.value);
    expect(numeros).toContain('12.34');
    expect(numeros).toContain('56.78');
  });

  it('NO incluye la sección de naturaleza opuesta cuando la lista está vacía', () => {
    const filas = mapearBalanceComprobacionAFilas(crearResponse(), perfilTodoNull);
    const valores = filas.flatMap((f) => f).map((c) => c.value);
    expect(valores.some((v) => typeof v === 'string' && v.includes('NATURALEZA OPUESTA'))).toBe(false);
  });

  it('incluye la sección de naturaleza opuesta con sus cuentas cuando hay señales a revisar', () => {
    const filas = mapearBalanceComprobacionAFilas(
      crearResponse({
        cuentasNaturalezaOpuesta: [
          {
            cuentaId: 'c9',
            codigoInterno: '1105',
            nombre: 'Anticipo a proveedores',
            naturaleza: 'DEUDORA',
            saldoOpuesto: '150.00',
          },
        ],
      }),
      perfilTodoNull,
    );

    const valores = filas.flatMap((f) => f).map((c) => c.value);
    expect(valores.some((v) => typeof v === 'string' && v.includes('NATURALEZA OPUESTA'))).toBe(true);

    const filaCuenta = filas.find((f) => f[1]?.value === 'Anticipo a proveedores');
    expect(filaCuenta).toBeDefined();
    expect(filaCuenta?.[3]).toMatchObject({ type: 'numero', value: '150.00' });
  });

  it('(estilo) la fila de encabezados de columna lleva todas las celdas en negrita', () => {
    const filas = mapearBalanceComprobacionAFilas(crearResponse(), perfilTodoNull);
    // Sin cabecera fiscal (perfil null), la fila 0 son los encabezados de columna
    const encabezados = filas[0];
    expect(encabezados?.[0]).toMatchObject({ value: 'Código', fontWeight: 'bold' });
    encabezados!.forEach((celda) => expect(celda).toMatchObject({ fontWeight: 'bold' }));
  });

  it('(estilo) las filas de detalle NO llevan fontWeight', () => {
    const filas = mapearBalanceComprobacionAFilas(crearResponse(), perfilTodoNull);
    const filaCaja = filas.find((f) => f[1]?.value === 'Caja');
    filaCaja!.forEach((celda) => expect('fontWeight' in celda).toBe(false));
  });

  it('antepone la cabecera fiscal cuando el perfil está completo', () => {
    const filas = mapearBalanceComprobacionAFilas(crearResponse(), perfilCompleto);
    expect(filas[0]?.[0]).toMatchObject({ type: 'texto', value: 'Avicont S.R.L.' });
  });

  it('no rompe ni imprime "null" con el perfil fiscal todo null', () => {
    expect(() => mapearBalanceComprobacionAFilas(crearResponse(), perfilTodoNull)).not.toThrow();
    const filas = mapearBalanceComprobacionAFilas(crearResponse(), perfilTodoNull);
    const valores = filas.flatMap((f) => f).map((c) => c.value);
    expect(valores.some((v) => v === 'null')).toBe(false);
  });
});
