import { describe, expect, it } from 'vitest';

import type { EmpresaPerfil } from '@/features/tenants/api/get-empresa';
import type { BalanceGeneralResponse } from '@/types/api';

import { mapearBalanceGeneralAFilas } from './exportar-balance-general';

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

function crearResponseBalance(
  overrides?: Partial<BalanceGeneralResponse>,
): BalanceGeneralResponse {
  return {
    fechaCorte: '2026-06-30',
    gestionId: 'g1',
    activo: {
      claseCuenta: 'ACTIVO',
      titulo: 'Activo',
      totalBob: '10000.00',
      subsecciones: [
        {
          subClaseCuenta: 'ACTIVO_CORRIENTE',
          titulo: 'Activo Corriente',
          totalBob: '10000.00',
          cuentas: [
            {
              cuentaId: 'c1',
              codigoInterno: '1101',
              nombre: 'Caja',
              nivel: 2,
              esContraria: false,
              esSintetica: false,
              saldoBob: '10000.00',
            },
          ],
        },
      ],
    },
    pasivo: {
      claseCuenta: 'PASIVO',
      titulo: 'Pasivo',
      totalBob: '3000.00',
      subsecciones: [
        {
          subClaseCuenta: 'PASIVO_CORRIENTE',
          titulo: 'Pasivo Corriente',
          totalBob: '3000.00',
          cuentas: [
            {
              cuentaId: 'c2',
              codigoInterno: '2101',
              nombre: 'Proveedores',
              nivel: 2,
              esContraria: false,
              esSintetica: false,
              saldoBob: '3000.00',
            },
          ],
        },
      ],
    },
    patrimonio: {
      claseCuenta: 'PATRIMONIO',
      titulo: 'Patrimonio',
      totalBob: '7000.00',
      subsecciones: [
        {
          subClaseCuenta: 'CAPITAL',
          titulo: 'Capital',
          totalBob: '7000.00',
          cuentas: [
            {
              cuentaId: 'c3',
              codigoInterno: '3101',
              nombre: 'Capital Social',
              nivel: 2,
              esContraria: false,
              esSintetica: false,
              saldoBob: '7000.00',
            },
          ],
        },
      ],
    },
    resultadoEjercicioBob: '0.00',
    totalActivoBob: '10000.00',
    totalPasivoBob: '3000.00',
    totalPatrimonioBob: '7000.00',
    cuadra: true,
    diferenciaBob: '0.00',
    ...overrides,
  };
}

describe('mapearBalanceGeneralAFilas', () => {
  it('mapea las 3 secciones aplanadas vía el helper de árbol, con subtotales del backend', () => {
    const response = crearResponseBalance();
    const filas = mapearBalanceGeneralAFilas(response, perfilTodoNull);

    // Las filas deben contener las 3 secciones del balance
    const valores = filas.map((f) => f[0]?.value ?? '');
    expect(valores.some((v) => v.includes('Activo'))).toBe(true);
    expect(valores.some((v) => v.includes('Pasivo'))).toBe(true);
    expect(valores.some((v) => v.includes('Patrimonio'))).toBe(true);
  });

  it('incluye una fila de cuadre con totalActivoBob/totalPasivoBob/totalPatrimonioBob del backend (sin sumar Pasivo+Patrimonio en cliente)', () => {
    const response = crearResponseBalance({
      totalActivoBob: '88888.88',
      totalPasivoBob: '33333.33',
      totalPatrimonioBob: '55555.55',
      cuadra: true,
      diferenciaBob: '0.00',
    });
    const filas = mapearBalanceGeneralAFilas(response, perfilTodoNull);

    // Las filas de cuadre son las 4 últimas: TOTAL ACTIVO, TOTAL PASIVO, TOTAL PATRIMONIO, cuadre/diferencia.
    // La celda de importe (columna 1) debe ser { type: 'numero', value: '...' } para que un mutante
    // que cambie el tipo a 'texto' haga fallar este test.
    const filaActivo = filas.find((f) => f[0]?.value === 'TOTAL ACTIVO');
    const filaPasivo = filas.find((f) => f[0]?.value === 'TOTAL PASIVO');
    const filaPatrimonio = filas.find((f) => f[0]?.value === 'TOTAL PATRIMONIO');

    expect(filaActivo?.[1]).toEqual({ type: 'numero', value: '88888.88' });
    expect(filaPasivo?.[1]).toEqual({ type: 'numero', value: '33333.33' });
    expect(filaPatrimonio?.[1]).toEqual({ type: 'numero', value: '55555.55' });
  });

  it('marca la cuenta contraria (esContraria true) en la hoja', () => {
    const response = crearResponseBalance({
      activo: {
        claseCuenta: 'ACTIVO',
        titulo: 'Activo',
        totalBob: '8000.00',
        subsecciones: [
          {
            subClaseCuenta: 'ACTIVO_CORRIENTE',
            titulo: 'Activo Corriente',
            totalBob: '8000.00',
            cuentas: [
              {
                cuentaId: 'c1',
                codigoInterno: '1199',
                nombre: 'Depreciación Acumulada',
                nivel: 2,
                esContraria: true,
                esSintetica: false,
                saldoBob: '2000.00',
              },
            ],
          },
        ],
      },
    });
    const filas = mapearBalanceGeneralAFilas(response, perfilTodoNull);

    const valores = filas.map((f) => f[0]?.value ?? '');
    const filaCuenta = valores.find((v) => v.includes('Depreciación Acumulada'));
    expect(filaCuenta).toBeDefined();
    expect(filaCuenta).toContain('contraria');
  });

  it('aplana una cuenta sintética con cuentaId/codigoInterno null sin imprimir "null"', () => {
    const response = crearResponseBalance({
      activo: {
        claseCuenta: 'ACTIVO',
        titulo: 'Activo',
        totalBob: '5000.00',
        subsecciones: [
          {
            subClaseCuenta: 'ACTIVO_CORRIENTE',
            titulo: 'Activo Corriente',
            totalBob: '5000.00',
            cuentas: [
              {
                cuentaId: null,         // cuenta sintética
                codigoInterno: null,    // sin código
                nombre: 'Grupo Caja',
                nivel: 2,
                esContraria: false,
                esSintetica: true,
                saldoBob: '5000.00',
              },
            ],
          },
        ],
      },
    });
    const filas = mapearBalanceGeneralAFilas(response, perfilTodoNull);

    const todasLasValues = filas.flatMap((f) => f).map((c) => c.value);
    // Ninguna celda debe contener el string "null"
    expect(todasLasValues.some((v) => v === 'null')).toBe(false);
    expect(todasLasValues.some((v) => typeof v === 'string' && v.includes('Grupo Caja'))).toBe(true);
  });

  it('incluye la cabecera fiscal al inicio cuando el perfil está completo', () => {
    const response = crearResponseBalance();
    const filas = mapearBalanceGeneralAFilas(response, perfilCompleto);

    const primeraFila = filas[0];
    expect(primeraFila?.[0]).toEqual({ type: 'texto', value: 'Avicont S.R.L.' });
  });

  it('no rompe cuando el perfil fiscal tiene todos los campos null', () => {
    const response = crearResponseBalance();
    expect(() => mapearBalanceGeneralAFilas(response, perfilTodoNull)).not.toThrow();

    const filas = mapearBalanceGeneralAFilas(response, perfilTodoNull);
    const todasLasValues = filas.flatMap((f) => f).map((c) => c.value);
    expect(todasLasValues.some((v) => v === 'null')).toBe(false);
  });
});
