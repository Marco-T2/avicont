import { describe, expect, it } from 'vitest';

import type { EmpresaPerfil } from '@/features/tenants/api/get-empresa';
import type { EvolucionPatrimonioResponse } from '@/types/api';

import { mapearEvolucionPatrimonioAFilas } from './exportar-evolucion-patrimonio';

const perfilTodoNull: EmpresaPerfil = {
  razonSocial: null,
  nit: null,
  direccion: null,
  representanteLegal: null,
  telefono: null,
  email: null,
};

function crearResponse(): EvolucionPatrimonioResponse {
  return {
    fechaDesde: '2026-01-01',
    fechaHasta: '2026-12-31',
    componentes: [
      {
        cuentaId: 'cap',
        codigoInterno: '3.1.1.001',
        nombre: 'Capital Social',
        esContraria: false,
        esSintetica: false,
        saldoInicialBob: '0.00',
        resultadoEjercicioBob: '0.00',
        otrosMovimientosBob: '100000.00',
        saldoFinalBob: '100000.00',
        cuadra: true,
        diferenciaBob: '0.00',
      },
      {
        cuentaId: null,
        codigoInterno: null,
        nombre: 'Resultado del Ejercicio (en curso)',
        esContraria: false,
        esSintetica: true,
        saldoInicialBob: '0.00',
        resultadoEjercicioBob: '30000.00',
        otrosMovimientosBob: '0.00',
        saldoFinalBob: '30000.00',
        cuadra: true,
        diferenciaBob: '0.00',
      },
    ],
    totales: {
      saldoInicialBob: '0.00',
      resultadoEjercicioBob: '30000.00',
      otrosMovimientosBob: '100000.00',
      saldoFinalBob: '130000.00',
    },
    cuadra: true,
    diferenciaBob: '0.00',
  };
}

describe('mapearEvolucionPatrimonioAFilas', () => {
  it('incluye encabezados de columna, una fila por componente, totales y cuadre', () => {
    const filas = mapearEvolucionPatrimonioAFilas(crearResponse(), perfilTodoNull);

    // Encabezado de columnas
    const header = filas.find((f) => f[0]?.value === 'Componente');
    expect(header).toBeDefined();
    expect(header).toHaveLength(5);

    // Fila del Capital con el codigoInterno antepuesto y montos string SIN recalcular (§4.5)
    const capital = filas.find((f) => f[0]?.value === '3.1.1.001 Capital Social');
    expect(capital).toBeDefined();
    expect(capital?.[3]).toEqual({ type: 'numero', value: '100000.00' });
    expect(capital?.[4]).toEqual({ type: 'numero', value: '100000.00' });

    // Fila de totales
    const total = filas.find((f) => f[0]?.value === 'TOTAL');
    expect(total?.[4]).toEqual({ type: 'numero', value: '130000.00', fontWeight: 'bold' });

    // Fila de cuadre
    const cuadre = filas.find((f) => f[0]?.value === '✓ Cuadra');
    expect(cuadre?.[4]).toEqual({ type: 'numero', value: '0.00', fontWeight: 'bold' });
  });

  it('marca "✗ No cuadra" cuando el backend reporta descuadre', () => {
    const response = crearResponse();
    response.cuadra = false;
    response.diferenciaBob = '5.00';

    const filas = mapearEvolucionPatrimonioAFilas(response, perfilTodoNull);
    const cuadre = filas.find((f) => f[0]?.value === '✗ No cuadra');
    expect(cuadre).toBeDefined();
    expect(cuadre?.[4]).toEqual({ type: 'numero', value: '5.00', fontWeight: 'bold' });
  });
});
