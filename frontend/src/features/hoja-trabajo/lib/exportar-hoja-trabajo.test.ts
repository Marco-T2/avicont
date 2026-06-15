import { describe, expect, it } from 'vitest';

import type { EmpresaPerfil } from '@/features/tenants/api/get-empresa';
import type { HojaTrabajoResponse } from '@/types/api';

import { mapearHojaTrabajoAFilas } from './exportar-hoja-trabajo';

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

function crearResponse(overrides?: Partial<HojaTrabajoResponse>): HojaTrabajoResponse {
  return {
    fechaDesde: '2026-04-01',
    fechaHasta: '2026-04-30',
    lineas: [
      {
        cuentaId: 'c1',
        codigoInterno: '1101',
        nombre: 'Caja',
        naturaleza: 'DEUDORA',
        claseCuenta: 'ACTIVO',
        esContraria: false,
        esSintetica: false,
        sumasDebe: '1000.00',
        sumasHaber: '300.00',
        saldoDeudor: '700.00',
        saldoAcreedor: '0.00',
        ajustesDebe: '0.00',
        ajustesHaber: '0.00',
        saldoAjustadoDeudor: '700.00',
        saldoAjustadoAcreedor: '0.00',
        erPerdidas: '0.00',
        erGanancias: '0.00',
        bgActivo: '700.00',
        bgPasPat: '0.00',
      },
      {
        cuentaId: null,
        codigoInterno: null,
        nombre: 'Utilidad del Ejercicio',
        naturaleza: null,
        claseCuenta: null,
        esContraria: false,
        esSintetica: true,
        sumasDebe: '0.00',
        sumasHaber: '0.00',
        saldoDeudor: '0.00',
        saldoAcreedor: '0.00',
        ajustesDebe: '0.00',
        ajustesHaber: '0.00',
        saldoAjustadoDeudor: '0.00',
        saldoAjustadoAcreedor: '0.00',
        erPerdidas: '500.00',
        erGanancias: '0.00',
        bgActivo: '0.00',
        bgPasPat: '500.00',
      },
    ],
    totales: {
      sumasDebe: '1000.00',
      sumasHaber: '300.00',
      saldoDeudor: '700.00',
      saldoAcreedor: '0.00',
      ajustesDebe: '0.00',
      ajustesHaber: '0.00',
      saldoAjustadoDeudor: '700.00',
      saldoAjustadoAcreedor: '0.00',
      perdidas: '500.00',
      ganancias: '500.00',
      activo: '700.00',
      pasivoPatrimonio: '700.00',
    },
    cuadres: {
      cuadra: true,
      cuadraSumas: true,
      cuadraSaldos: true,
      cuadraAjustes: true,
      cuadraSaldosAjustados: true,
      cuadraEstadoResultados: true,
      cuadraBalanceGeneral: true,
      diferenciaSumas: '0.00',
      diferenciaSaldos: '0.00',
      diferenciaAjustes: '0.00',
      diferenciaSaldosAjustados: '0.00',
      diferenciaEstadoResultados: '0.00',
      diferenciaBalanceGeneral: '0.00',
    },
    cuentasNaturalezaOpuesta: [],
    ...overrides,
  };
}

describe('mapearHojaTrabajoAFilas', () => {
  it('genera una fila por cuenta con las 12 columnas de montos como número', () => {
    const filas = mapearHojaTrabajoAFilas(crearResponse(), perfilTodoNull);

    const filaCaja = filas.find((f) => f[1]?.value === 'Caja');
    expect(filaCaja).toBeDefined();
    expect(filaCaja?.[0]).toMatchObject({ type: 'texto', value: '1101' });
    // 12 columnas de montos (índices 2..13)
    expect(filaCaja?.[2]).toMatchObject({ type: 'numero', value: '1000.00' });
    expect(filaCaja?.[3]).toMatchObject({ type: 'numero', value: '300.00' });
    expect(filaCaja?.[4]).toMatchObject({ type: 'numero', value: '700.00' });
    expect(filaCaja?.[5]).toMatchObject({ type: 'numero', value: '0.00' });
    expect(filaCaja?.[8]).toMatchObject({ type: 'numero', value: '700.00' });
    expect(filaCaja?.[12]).toMatchObject({ type: 'numero', value: '700.00' });
    expect(filaCaja).toHaveLength(14);
  });

  it('incluye la fila sintética (Utilidad/Pérdida del Ejercicio) con su aporte a ER y BG', () => {
    const filas = mapearHojaTrabajoAFilas(crearResponse(), perfilTodoNull);

    const filaSintetica = filas.find((f) => f[1]?.value === 'Utilidad del Ejercicio');
    expect(filaSintetica).toBeDefined();
    // codigoInterno null → celda vacía, no "null"
    expect(filaSintetica?.[0]).toMatchObject({ type: 'texto', value: '' });
    expect(filaSintetica?.[10]).toMatchObject({ type: 'numero', value: '500.00' });
    expect(filaSintetica?.[13]).toMatchObject({ type: 'numero', value: '500.00' });
  });

  it('incluye la fila TOTALES con los 12 totales del backend como número (sin recalcular)', () => {
    const filas = mapearHojaTrabajoAFilas(
      crearResponse({
        totales: {
          sumasDebe: '11111.11',
          sumasHaber: '22222.22',
          saldoDeudor: '33333.33',
          saldoAcreedor: '44444.44',
          ajustesDebe: '55555.55',
          ajustesHaber: '66666.66',
          saldoAjustadoDeudor: '77777.77',
          saldoAjustadoAcreedor: '88888.88',
          perdidas: '99999.99',
          ganancias: '10000.00',
          activo: '20000.00',
          pasivoPatrimonio: '30000.00',
        },
      }),
      perfilTodoNull,
    );

    const filaTotales = filas.find((f) => f[0]?.value === 'TOTALES');
    expect(filaTotales?.[2]).toMatchObject({ type: 'numero', value: '11111.11' });
    expect(filaTotales?.[10]).toMatchObject({ type: 'numero', value: '99999.99' });
    expect(filaTotales?.[11]).toMatchObject({ type: 'numero', value: '10000.00' });
    expect(filaTotales?.[12]).toMatchObject({ type: 'numero', value: '20000.00' });
    expect(filaTotales?.[13]).toMatchObject({ type: 'numero', value: '30000.00' });
  });

  it('incluye una fila de cuadre que refleja el estado global y las diferencias clave', () => {
    const filas = mapearHojaTrabajoAFilas(
      crearResponse({
        cuadres: {
          cuadra: false,
          cuadraSumas: true,
          cuadraSaldos: true,
          cuadraAjustes: true,
          cuadraSaldosAjustados: true,
          cuadraEstadoResultados: false,
          cuadraBalanceGeneral: false,
          diferenciaSumas: '0.00',
          diferenciaSaldos: '0.00',
          diferenciaAjustes: '0.00',
          diferenciaSaldosAjustados: '0.00',
          diferenciaEstadoResultados: '12.34',
          diferenciaBalanceGeneral: '56.78',
        },
      }),
      perfilTodoNull,
    );

    const filaCuadre = filas.find(
      (f) => typeof f[0]?.value === 'string' && f[0].value.includes('No cuadra'),
    );
    expect(filaCuadre).toBeDefined();
    const numeros = filas
      .flatMap((f) => f)
      .filter((c) => c.type === 'numero')
      .map((c) => c.value);
    expect(numeros).toContain('12.34');
    expect(numeros).toContain('56.78');
  });

  it('NO incluye la sección de naturaleza opuesta cuando la lista está vacía', () => {
    const filas = mapearHojaTrabajoAFilas(crearResponse(), perfilTodoNull);
    const valores = filas.flatMap((f) => f).map((c) => c.value);
    expect(valores.some((v) => typeof v === 'string' && v.includes('NATURALEZA OPUESTA'))).toBe(
      false,
    );
  });

  it('incluye la sección de naturaleza opuesta con sus cuentas cuando hay señales a revisar', () => {
    const filas = mapearHojaTrabajoAFilas(
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
    expect(valores.some((v) => typeof v === 'string' && v.includes('NATURALEZA OPUESTA'))).toBe(
      true,
    );

    const filaCuenta = filas.find((f) => f[1]?.value === 'Anticipo a proveedores');
    expect(filaCuenta).toBeDefined();
    expect(filaCuenta?.[3]).toMatchObject({ type: 'numero', value: '150.00' });
  });

  it('(estilo) la fila de encabezados de columna lleva todas las celdas en negrita', () => {
    const filas = mapearHojaTrabajoAFilas(crearResponse(), perfilTodoNull);
    // Sin cabecera fiscal (perfil null), la fila 0 son los encabezados de columna
    const encabezados = filas[0];
    expect(encabezados?.[0]).toMatchObject({ value: 'Código', fontWeight: 'bold' });
    encabezados!.forEach((celda) => expect(celda).toMatchObject({ fontWeight: 'bold' }));
  });

  it('(estilo) las filas de detalle NO llevan fontWeight', () => {
    const filas = mapearHojaTrabajoAFilas(crearResponse(), perfilTodoNull);
    const filaCaja = filas.find((f) => f[1]?.value === 'Caja');
    filaCaja!.forEach((celda) => expect('fontWeight' in celda).toBe(false));
  });

  it('antepone la cabecera fiscal cuando el perfil está completo', () => {
    const filas = mapearHojaTrabajoAFilas(crearResponse(), perfilCompleto);
    expect(filas[0]?.[0]).toMatchObject({ type: 'texto', value: 'Avicont S.R.L.' });
  });

  it('no rompe ni imprime "null" con el perfil fiscal todo null', () => {
    expect(() => mapearHojaTrabajoAFilas(crearResponse(), perfilTodoNull)).not.toThrow();
    const filas = mapearHojaTrabajoAFilas(crearResponse(), perfilTodoNull);
    const valores = filas.flatMap((f) => f).map((c) => c.value);
    expect(valores.some((v) => v === 'null')).toBe(false);
  });
});
